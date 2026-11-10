// The engine's 2D physics on Box2D v3: a flat layer of numbers in and numbers out, so JavaScript calls
// it on a bare WebAssembly module with no glue (Box2D's own API passes structs by value).
//
// Everything is a small integer to JavaScript: a world is its packed id, and a body, a shape and a
// joint are handles into the tables below: a slot, and how many times that slot has been used, so a
// handle kept after its thing is gone never names the next thing put in the same slot. A shape carries
// its handle as its user data, so what Box2D hands back (an event, a query hit) is turned into the
// handle the engine knows.
//
// Several worlds at once: a scene coming in is built before the one going out is torn down, and a
// page can run two games.
#include "box2d/box2d.h"
#include <float.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define EXPORT __attribute__((visibility("default")))
#define IMPORT(name) __attribute__((import_module("env"), import_name(name)))

// Asked of every contact touching a shape that wants it (a ledge, a character), before it is solved:
// whether the solver resolves it. Answered by the engine, which knows what a ledge holds.
IMPORT("presolve") extern int js_presolve(int world, int shapeA, int shapeB, float normalX, float normalY);

// What a shape is beside its geometry, for the queries a character makes.
enum
{
	SHAPE_SENSOR = 1,
	SHAPE_LEDGE = 2,
	// A character's body in the world: what lands on it and what a trigger sees. Never in its own way.
	SHAPE_PRESENCE = 4,
};

// ---- Buffers shared with JavaScript ----

static float* inBuffer = NULL;
static int inCapacity = 0;
static float* outBuffer = NULL;
static int outCapacity = 0;

static void ensure(float** buffer, int* capacity, int floats)
{
	if (floats <= *capacity) return;
	int next = *capacity == 0 ? 256 : *capacity;
	while (next < floats) next *= 2;
	*buffer = realloc(*buffer, (size_t)next * sizeof(float));
	*capacity = next;
}

// Room for `floats` numbers from JavaScript, and where to write them. May move: asked before each use.
EXPORT float* nb_in(int floats)
{
	ensure(&inBuffer, &inCapacity, floats);
	return inBuffer;
}

// Where the last call that answers through memory wrote its answer.
EXPORT float* nb_out(void)
{
	ensure(&outBuffer, &outCapacity, 16);
	return outBuffer;
}

static void outInt(int index, int value)
{
	((int32_t*)outBuffer)[index] = value;
}

// ---- Tables of ids ----

typedef struct
{
	b2BodyId id;
	int world;
} BodySlot;

typedef struct
{
	b2ShapeId id;
	int flags;
	int body;
	int world;
} ShapeSlot;

typedef struct
{
	b2JointId id;
	int world;
} JointSlot;

typedef struct
{
	void* items;
	int size;
	int count;
	int capacity;
	int* free;
	int freeCount;
	// Whether each slot holds something: a slot freed and not yet reused does not.
	uint8_t* live;
	// How many times each slot has been taken, which is part of its handle.
	uint16_t* uses;
} Table;

// A handle: the slot in its low 20 bits, the slot's use above them (11 bits, so it stays positive).
#define SLOT_BITS 20
#define SLOT_MASK ((1 << SLOT_BITS) - 1)
#define USE_MASK 0x7ff

static Table bodies = { NULL, sizeof(BodySlot), 0, 0, NULL, 0, NULL, NULL };
static Table shapes = { NULL, sizeof(ShapeSlot), 0, 0, NULL, 0, NULL, NULL };
static Table joints = { NULL, sizeof(JointSlot), 0, 0, NULL, 0, NULL, NULL };

static int handleOf(const Table* table, int slot)
{
	return slot | ((int)table->uses[slot] << SLOT_BITS);
}

static int take(Table* table)
{
	int slot;
	if (table->freeCount > 0)
	{
		slot = table->free[--table->freeCount];
		table->uses[slot] = (uint16_t)((table->uses[slot] + 1) & USE_MASK);
	}
	else
	{
		if (table->count == table->capacity)
		{
			int next = table->capacity == 0 ? 64 : table->capacity * 2;
			table->items = realloc(table->items, (size_t)next * (size_t)table->size);
			table->free = realloc(table->free, (size_t)next * sizeof(int));
			table->live = realloc(table->live, (size_t)next);
			table->uses = realloc(table->uses, (size_t)next * sizeof(uint16_t));
			table->capacity = next;
		}
		slot = table->count++;
		table->uses[slot] = 0;
	}
	table->live[slot] = 1;
	return handleOf(table, slot);
}

// Whether a handle names what its slot holds now.
static bool held(const Table* table, int handle)
{
	if (handle < 0) return false;
	int slot = handle & SLOT_MASK;
	return slot < table->count && table->live[slot] != 0 && handleOf(table, slot) == handle;
}

static void give(Table* table, int handle)
{
	if (held(table, handle) == false) return;
	int slot = handle & SLOT_MASK;
	table->live[slot] = 0;
	table->free[table->freeCount++] = slot;
}

#define BODY(handle) (((BodySlot*)bodies.items)[(handle) & SLOT_MASK])
#define SHAPE(handle) (((ShapeSlot*)shapes.items)[(handle) & SLOT_MASK])
#define JOINT(handle) (((JointSlot*)joints.items)[(handle) & SLOT_MASK])

static int packWorld(b2WorldId id)
{
	return (int)id.index1 | ((int)id.generation << 16);
}

static b2WorldId unpackWorld(int key)
{
	return (b2WorldId){ (uint16_t)(key & 0xffff), (uint16_t)((key >> 16) & 0xffff) };
}

// The handle a shape of Box2D's is, or -1 for one that is gone.
static int slotOfShape(b2ShapeId id)
{
	if (b2Shape_IsValid(id) == false) return -1;
	return (int)(intptr_t)b2Shape_GetUserData(id) - 1;
}

static bool liveBody(int body)
{
	return held(&bodies, body) && b2Body_IsValid(BODY(body).id);
}

static bool liveShape(int shape)
{
	return held(&shapes, shape) && b2Shape_IsValid(SHAPE(shape).id);
}

// ---- Worlds ----

// How two touching surfaces grip and bounce: the mean of the two, which is what a game author expects
// from two numbers (Box2D's own rules would let the bouncier one decide alone).
static float mixMean(float a, int materialA, float b, int materialB)
{
	(void)materialA;
	(void)materialB;
	return 0.5f * (a + b);
}

static bool preSolve(b2ShapeId shapeA, b2ShapeId shapeB, b2Manifold* manifold, void* context)
{
	return js_presolve((int)(intptr_t)context, slotOfShape(shapeA), slotOfShape(shapeB), manifold->normal.x, manifold->normal.y) != 0;
}

// How many pixels are a metre: Box2D's tolerances are tuned in metres. Before any world.
EXPORT void nb_units(float pixelsPerMeter)
{
	b2SetLengthUnitsPerMeter(pixelsPerMeter);
}

// A new world, or -1 when there is no room for another: Box2D keeps at most 128 at once.
EXPORT int nb_world_create(float gravityX, float gravityY)
{
	b2WorldDef def = b2DefaultWorldDef();
	def.gravity = (b2Vec2){ gravityX, gravityY };
	def.frictionCallback = mixMean;
	def.restitutionCallback = mixMean;
	// As fast as a game throws anything: Box2D's own limit, 400 metres a second, is 6400 pixels here,
	// and a bullet may go faster.
	def.maximumLinearSpeed = 1.0e6f;
	b2WorldId id = b2CreateWorld(&def);
	if (b2World_IsValid(id) == false) return -1;
	int key = packWorld(id);
	b2World_SetPreSolveCallback(id, preSolve, (void*)(intptr_t)key);
	return key;
}

static void forgetWorld(Table* table, int world, int offset)
{
	for (int slot = 0; slot < table->count; ++slot)
	{
		if (table->live[slot] && *(int*)((char*)table->items + (size_t)slot * (size_t)table->size + (size_t)offset) == world)
		{
			give(table, handleOf(table, slot));
		}
	}
}

EXPORT void nb_world_destroy(int world)
{
	b2WorldId id = unpackWorld(world);
	if (b2World_IsValid(id)) b2DestroyWorld(id);
	forgetWorld(&bodies, world, offsetof(BodySlot, world));
	forgetWorld(&shapes, world, offsetof(ShapeSlot, world));
	forgetWorld(&joints, world, offsetof(JointSlot, world));
}

EXPORT void nb_world_step(int world, float dt, int substeps)
{
	b2World_Step(unpackWorld(world), dt, substeps);
}

EXPORT void nb_world_gravity(int world, float x, float y)
{
	b2World_SetGravity(unpackWorld(world), (b2Vec2){ x, y });
}

// What started and stopped touching in the last step, as [kind, shapeA, shapeB] each: 1 a contact
// began, 2 one ended, 3 a sensor began to see something, 4 it stopped. A shape already gone is -1.
EXPORT int nb_world_events(int world)
{
	b2WorldId id = unpackWorld(world);
	b2ContactEvents contacts = b2World_GetContactEvents(id);
	b2SensorEvents sensors = b2World_GetSensorEvents(id);
	int count = contacts.beginCount + contacts.endCount + sensors.beginCount + sensors.endCount;
	ensure(&outBuffer, &outCapacity, count * 3 + 1);
	int at = 0;
	for (int i = 0; i < contacts.beginCount; ++i, at += 3)
	{
		outInt(at, 1);
		outInt(at + 1, slotOfShape(contacts.beginEvents[i].shapeIdA));
		outInt(at + 2, slotOfShape(contacts.beginEvents[i].shapeIdB));
	}
	for (int i = 0; i < contacts.endCount; ++i, at += 3)
	{
		outInt(at, 2);
		outInt(at + 1, slotOfShape(contacts.endEvents[i].shapeIdA));
		outInt(at + 2, slotOfShape(contacts.endEvents[i].shapeIdB));
	}
	for (int i = 0; i < sensors.beginCount; ++i, at += 3)
	{
		outInt(at, 3);
		outInt(at + 1, slotOfShape(sensors.beginEvents[i].sensorShapeId));
		outInt(at + 2, slotOfShape(sensors.beginEvents[i].visitorShapeId));
	}
	for (int i = 0; i < sensors.endCount; ++i, at += 3)
	{
		outInt(at, 4);
		outInt(at + 1, slotOfShape(sensors.endEvents[i].sensorShapeId));
		outInt(at + 2, slotOfShape(sensors.endEvents[i].visitorShapeId));
	}
	return count;
}

// ---- Bodies ----

// type: 0 still, 1 moved by the game, 2 moved by the simulation.
EXPORT int nb_body_create(int world, int type, float x, float y, float angle)
{
	b2BodyDef def = b2DefaultBodyDef();
	def.type = type == 0 ? b2_staticBody : type == 1 ? b2_kinematicBody : b2_dynamicBody;
	def.position = (b2Vec2){ x, y };
	def.rotation = b2MakeRot(angle);
	int slot = take(&bodies);
	BODY(slot).id = b2CreateBody(unpackWorld(world), &def);
	BODY(slot).world = world;
	return slot;
}

// Takes a body out, with its shapes and its joints. Its shapes' slots are freed with it.
EXPORT void nb_body_destroy(int body)
{
	if (liveBody(body) == false)
	{
		give(&bodies, body);
		return;
	}
	b2BodyId id = BODY(body).id;
	int shapeCount = b2Body_GetShapeCount(id);
	if (shapeCount > 0)
	{
		b2ShapeId* list = malloc((size_t)shapeCount * sizeof(b2ShapeId));
		b2Body_GetShapes(id, list, shapeCount);
		for (int i = 0; i < shapeCount; ++i) give(&shapes, slotOfShape(list[i]));
		free(list);
	}
	// Its joints go with it in Box2D, and their slots stay taken until the engine lets go of them
	// (nb_joint_destroy): a slot handed to a new joint meanwhile would be destroyed in its place.
	b2DestroyBody(id);
	give(&bodies, body);
}

EXPORT int nb_body_valid(int body)
{
	return liveBody(body);
}

EXPORT float nb_body_x(int body)
{
	return b2Body_GetPosition(BODY(body).id).x;
}

EXPORT float nb_body_y(int body)
{
	return b2Body_GetPosition(BODY(body).id).y;
}

EXPORT float nb_body_angle(int body)
{
	return b2Rot_GetAngle(b2Body_GetRotation(BODY(body).id));
}

EXPORT float nb_body_vx(int body)
{
	return b2Body_GetLinearVelocity(BODY(body).id).x;
}

EXPORT float nb_body_vy(int body)
{
	return b2Body_GetLinearVelocity(BODY(body).id).y;
}

EXPORT float nb_body_spin(int body)
{
	return b2Body_GetAngularVelocity(BODY(body).id);
}

EXPORT float nb_body_mass(int body)
{
	return b2Body_GetMass(BODY(body).id);
}

// How hard it is to turn about its own centre of mass.
EXPORT float nb_body_inertia(int body)
{
	return b2Body_GetRotationalInertia(BODY(body).id);
}

EXPORT float nb_body_mass_x(int body)
{
	return b2Body_GetWorldCenterOfMass(BODY(body).id).x;
}

EXPORT float nb_body_mass_y(int body)
{
	return b2Body_GetWorldCenterOfMass(BODY(body).id).y;
}

// 0 still, 1 moved by the game, 2 moved by the simulation.
EXPORT int nb_body_type(int body)
{
	b2BodyType type = b2Body_GetType(BODY(body).id);
	return type == b2_staticBody ? 0 : type == b2_kinematicBody ? 1 : 2;
}

EXPORT void nb_body_impulse(int body, float x, float y, int wake)
{
	b2Body_ApplyLinearImpulseToCenter(BODY(body).id, (b2Vec2){ x, y }, wake != 0);
}

EXPORT void nb_body_impulse_at(int body, float x, float y, float pointX, float pointY, int wake)
{
	b2Body_ApplyLinearImpulse(BODY(body).id, (b2Vec2){ x, y }, (b2Vec2){ pointX, pointY }, wake != 0);
}

EXPORT void nb_body_turn_impulse(int body, float impulse, int wake)
{
	b2Body_ApplyAngularImpulse(BODY(body).id, impulse, wake != 0);
}

// Box2D forgets a force once a step is over: asked before every step it should push in.
EXPORT void nb_body_force(int body, float x, float y, int wake)
{
	b2Body_ApplyForceToCenter(BODY(body).id, (b2Vec2){ x, y }, wake != 0);
}

EXPORT void nb_body_set_velocity(int body, float x, float y)
{
	b2BodyId id = BODY(body).id;
	b2Body_SetLinearVelocity(id, (b2Vec2){ x, y });
	if (b2Body_GetType(id) != b2_staticBody) b2Body_SetAwake(id, true);
}

EXPORT void nb_body_set_spin(int body, float spin)
{
	b2BodyId id = BODY(body).id;
	b2Body_SetAngularVelocity(id, spin);
	if (b2Body_GetType(id) != b2_staticBody) b2Body_SetAwake(id, true);
}

EXPORT void nb_body_set_transform(int body, float x, float y, float angle)
{
	b2Body_SetTransform(BODY(body).id, (b2Vec2){ x, y }, b2MakeRot(angle));
}

// Moves a body the game moves to a place by the end of the next `dt`, at the speed that takes, so what
// it carries or shoves feels it move rather than being jumped over.
EXPORT void nb_body_move_to(int body, float x, float y, float angle, float dt)
{
	b2Transform target = { (b2Vec2){ x, y }, b2MakeRot(angle) };
	b2Body_SetTargetTransform(BODY(body).id, target, dt);
}

EXPORT void nb_body_set_mass(int body, float mass, float inertia)
{
	b2MassData data = { mass, (b2Vec2){ 0.0f, 0.0f }, inertia };
	b2Body_SetMassData(BODY(body).id, data);
}

EXPORT void nb_body_damping(int body, float linear, float angular)
{
	b2Body_SetLinearDamping(BODY(body).id, linear);
	b2Body_SetAngularDamping(BODY(body).id, angular);
}

EXPORT void nb_body_fixed_rotation(int body, int fixed)
{
	b2Body_SetFixedRotation(BODY(body).id, fixed != 0);
}

// Whether it may fall asleep when it slows down. A body pushed slowly is kept awake while it is pushed:
// asleep, it would stop dead every time it came under the speed that counts as resting.
EXPORT void nb_body_sleep(int body, int enable)
{
	b2Body_EnableSleep(BODY(body).id, enable != 0);
}

EXPORT void nb_body_wake(int body)
{
	b2Body_SetAwake(BODY(body).id, true);
}

// ---- Shapes ----

// What every shape is besides its geometry. `category` and `mask` are the layers it is on and those it
// meets; a sensor reports and never resolves.
static b2ShapeDef shapeDef(float density, float friction, float bounce, int flags, int category, int mask)
{
	b2ShapeDef def = b2DefaultShapeDef();
	def.density = density;
	def.material.friction = friction;
	def.material.restitution = bounce;
	def.isSensor = (flags & SHAPE_SENSOR) != 0;
	// Seen by sensors, and seeing: Box2D asks both sides, and a trigger sees everything.
	def.enableSensorEvents = true;
	// Every contact is reported as it begins and ends. Asking only when someone listens is not enough
	// here: Box2D decides when a contact begins, so one already touching would never be heard.
	def.enableContactEvents = true;
	def.enablePreSolveEvents = (flags & (SHAPE_LEDGE | SHAPE_PRESENCE)) != 0;
	def.filter.categoryBits = (uint64_t)(uint32_t)category;
	def.filter.maskBits = (uint64_t)(uint32_t)mask;
	return def;
}

static int keepShape(int body, b2ShapeId id, int flags)
{
	int slot = take(&shapes);
	SHAPE(slot).id = id;
	SHAPE(slot).flags = flags;
	SHAPE(slot).body = body;
	SHAPE(slot).world = BODY(body).world;
	b2Shape_SetUserData(id, (void*)(intptr_t)(slot + 1));
	return slot;
}

EXPORT int nb_shape_circle(int body, float x, float y, float radius, float density, float friction, float bounce, int flags, int category, int mask)
{
	b2ShapeDef def = shapeDef(density, friction, bounce, flags, category, mask);
	b2Circle circle = { (b2Vec2){ x, y }, radius };
	return keepShape(body, b2CreateCircleShape(BODY(body).id, &def, &circle), flags);
}

// A box `halfWidth` by `halfHeight` about (x, y) on the body, its corners rounded by `radius` inside it.
EXPORT int nb_shape_box(int body, float halfWidth, float halfHeight, float x, float y, float radius, float density, float friction, float bounce, int flags, int category, int mask)
{
	b2ShapeDef def = shapeDef(density, friction, bounce, flags, category, mask);
	b2Polygon box = b2MakeOffsetRoundedBox(halfWidth - radius, halfHeight - radius, (b2Vec2){ x, y }, b2Rot_identity, radius);
	return keepShape(body, b2CreatePolygonShape(BODY(body).id, &def, &box), flags);
}

// A convex polygon of `count` points (at most 8) written to nb_in as x, y. -1 if they enclose nothing.
EXPORT int nb_shape_polygon(int body, int count, float radius, float density, float friction, float bounce, int flags, int category, int mask)
{
	if (count < 3 || count > B2_MAX_POLYGON_VERTICES) return -1;
	b2Vec2 points[B2_MAX_POLYGON_VERTICES];
	for (int i = 0; i < count; ++i) points[i] = (b2Vec2){ inBuffer[i * 2], inBuffer[i * 2 + 1] };
	b2Hull hull = b2ComputeHull(points, count);
	if (hull.count == 0) return -1;
	b2ShapeDef def = shapeDef(density, friction, bounce, flags, category, mask);
	b2Polygon polygon = b2MakePolygon(&hull, radius);
	return keepShape(body, b2CreatePolygonShape(BODY(body).id, &def, &polygon), flags);
}

EXPORT int nb_shape_capsule(int body, float x1, float y1, float x2, float y2, float radius, float density, float friction, float bounce, int flags, int category, int mask)
{
	b2ShapeDef def = shapeDef(density, friction, bounce, flags, category, mask);
	b2Capsule capsule = { (b2Vec2){ x1, y1 }, (b2Vec2){ x2, y2 }, radius };
	return keepShape(body, b2CreateCapsuleShape(BODY(body).id, &def, &capsule), flags);
}

EXPORT void nb_shape_filter(int shape, int category, int mask)
{
	if (liveShape(shape) == false) return;
	b2Filter filter = b2Shape_GetFilter(SHAPE(shape).id);
	filter.categoryBits = (uint64_t)(uint32_t)category;
	filter.maskBits = (uint64_t)(uint32_t)mask;
	b2Shape_SetFilter(SHAPE(shape).id, filter);
}

EXPORT void nb_shape_contact_events(int shape, int on)
{
	if (liveShape(shape)) b2Shape_EnableContactEvents(SHAPE(shape).id, on != 0);
}

EXPORT int nb_shape_body(int shape)
{
	return held(&shapes, shape) ? SHAPE(shape).body : -1;
}

EXPORT int nb_shape_flags(int shape)
{
	return held(&shapes, shape) ? SHAPE(shape).flags : 0;
}

// How far down it reaches in the world: its feet, whichever way it is turned.
EXPORT float nb_shape_bottom(int shape)
{
	return b2Shape_GetAABB(SHAPE(shape).id).upperBound.y;
}

// ---- Joints ----

static int keepJoint(b2JointId id, int world)
{
	int slot = take(&joints);
	JOINT(slot).id = id;
	JOINT(slot).world = world;
	b2Joint_SetUserData(id, (void*)(intptr_t)(slot + 1));
	return slot;
}

static b2WorldId worldOfBody(int body)
{
	return unpackWorld(BODY(body).world);
}

// Pinned together at a point measured on each, each free to turn about it.
EXPORT int nb_joint_hinge(int a, int b, float ax, float ay, float bx, float by, float reference, int limit, float lower, float upper, int motor, float maxTorque, float speed, int collide)
{
	b2RevoluteJointDef def = b2DefaultRevoluteJointDef();
	def.bodyIdA = BODY(a).id;
	def.bodyIdB = BODY(b).id;
	def.localAnchorA = (b2Vec2){ ax, ay };
	def.localAnchorB = (b2Vec2){ bx, by };
	def.referenceAngle = reference;
	def.enableLimit = limit != 0;
	def.lowerAngle = lower;
	def.upperAngle = upper;
	def.enableMotor = motor != 0;
	def.maxMotorTorque = maxTorque;
	def.motorSpeed = speed;
	def.collideConnected = collide != 0;
	return keepJoint(b2CreateRevoluteJoint(worldOfBody(a), &def), BODY(a).world);
}

// Free to slide along an axis measured on `a`, never turning.
EXPORT int nb_joint_slider(int a, int b, float ax, float ay, float bx, float by, float axisX, float axisY, float reference, int limit, float lower, float upper, int motor, float maxForce, float speed, int collide)
{
	b2PrismaticJointDef def = b2DefaultPrismaticJointDef();
	def.bodyIdA = BODY(a).id;
	def.bodyIdB = BODY(b).id;
	def.localAnchorA = (b2Vec2){ ax, ay };
	def.localAnchorB = (b2Vec2){ bx, by };
	def.localAxisA = b2Normalize((b2Vec2){ axisX, axisY });
	def.referenceAngle = reference;
	def.enableLimit = limit != 0;
	def.lowerTranslation = lower;
	def.upperTranslation = upper;
	def.enableMotor = motor != 0;
	def.maxMotorForce = maxForce;
	def.motorSpeed = speed;
	def.collideConnected = collide != 0;
	return keepJoint(b2CreatePrismaticJoint(worldOfBody(a), &def), BODY(a).world);
}

// Two points kept `length` apart: rigid, a spring (`hertz` above 0), or a rope (`limit` with a spring
// of no stiffness, so only the longest length holds).
EXPORT int nb_joint_distance(int a, int b, float ax, float ay, float bx, float by, float length, int spring, float hertz, float damping, int limit, float minLength, float maxLength, int collide)
{
	b2DistanceJointDef def = b2DefaultDistanceJointDef();
	def.bodyIdA = BODY(a).id;
	def.bodyIdB = BODY(b).id;
	def.localAnchorA = (b2Vec2){ ax, ay };
	def.localAnchorB = (b2Vec2){ bx, by };
	def.length = length;
	def.enableSpring = spring != 0;
	def.hertz = hertz;
	def.dampingRatio = damping;
	def.enableLimit = limit != 0;
	// With no limit, any length: Box2D keeps the longest at least the shortest, so leaving both at 0
	// would make a spring of no length at all.
	def.minLength = limit != 0 ? minLength : 0.0f;
	def.maxLength = limit != 0 ? maxLength : 1.0e9f;
	def.collideConnected = collide != 0;
	return keepJoint(b2CreateDistanceJoint(worldOfBody(a), &def), BODY(a).world);
}

// Held as they are, as one. Hertz of 0 is rigid.
EXPORT int nb_joint_weld(int a, int b, float ax, float ay, float bx, float by, float reference, float linearHertz, float angularHertz, float damping, int collide)
{
	b2WeldJointDef def = b2DefaultWeldJointDef();
	def.bodyIdA = BODY(a).id;
	def.bodyIdB = BODY(b).id;
	def.localAnchorA = (b2Vec2){ ax, ay };
	def.localAnchorB = (b2Vec2){ bx, by };
	def.referenceAngle = reference;
	def.linearHertz = linearHertz;
	def.angularHertz = angularHertz;
	def.linearDampingRatio = damping;
	def.angularDampingRatio = damping;
	def.collideConnected = collide != 0;
	return keepJoint(b2CreateWeldJoint(worldOfBody(a), &def), BODY(a).world);
}

EXPORT int nb_joint_valid(int joint)
{
	return held(&joints, joint) && b2Joint_IsValid(JOINT(joint).id);
}

EXPORT void nb_joint_destroy(int joint)
{
	if (nb_joint_valid(joint)) b2DestroyJoint(JOINT(joint).id);
	give(&joints, joint);
}

// Where it holds `a`, measured on `a`.
EXPORT float nb_joint_anchor_x(int joint)
{
	return b2Joint_GetLocalAnchorA(JOINT(joint).id).x;
}

EXPORT float nb_joint_anchor_y(int joint)
{
	return b2Joint_GetLocalAnchorA(JOINT(joint).id).y;
}

// ---- Queries a character makes ----

// Which shapes a query passes by: sensors always, ledges when asked, and one shape (its own body).
typedef struct
{
	int skipFlags;
	int skipShape;
} Skip;

static bool skipped(b2ShapeId id, const Skip* skip, int* slotOut)
{
	int slot = slotOfShape(id);
	*slotOut = slot;
	if (slot < 0) return true;
	if (slot == skip->skipShape) return true;
	return (SHAPE(slot).flags & skip->skipFlags) != 0;
}

static b2QueryFilter queryFilter(int category, int mask)
{
	return (b2QueryFilter){ (uint64_t)(uint32_t)category, (uint64_t)(uint32_t)mask };
}

typedef struct
{
	Skip skip;
	int count;
} PlaneGather;

static bool gatherPlane(b2ShapeId id, const b2PlaneResult* result, void* context)
{
	PlaneGather* gather = context;
	int slot;
	if (skipped(id, &gather->skip, &slot)) return true;
	ensure(&outBuffer, &outCapacity, (gather->count + 1) * 4);
	int at = gather->count * 4;
	outBuffer[at] = result->plane.normal.x;
	outBuffer[at + 1] = result->plane.normal.y;
	outBuffer[at + 2] = result->plane.offset;
	outInt(at + 3, slot);
	gather->count++;
	return true;
}

// Every surface a capsule overlaps, as [normalX, normalY, offset, shape] each, the normal pointing at the
// capsule and the offset how far it is inside. Passes by sensors, `skipFlags` and `skipShape`.
EXPORT int nb_mover_collide(int world, float x1, float y1, float x2, float y2, float radius, int category, int mask, int skipFlags, int skipShape)
{
	b2Capsule mover = { (b2Vec2){ x1, y1 }, (b2Vec2){ x2, y2 }, radius };
	PlaneGather gather = { { skipFlags | SHAPE_SENSOR, skipShape }, 0 };
	b2World_CollideMover(unpackWorld(world), &mover, queryFilter(category, mask), gatherPlane, &gather);
	return gather.count;
}

// The move that respects the planes in nb_in, as [normalX, normalY, offset, clip] each: out [x, y].
EXPORT void nb_mover_solve(float dx, float dy, int count)
{
	b2CollisionPlane* planes = malloc((size_t)(count > 0 ? count : 1) * sizeof(b2CollisionPlane));
	for (int i = 0; i < count; ++i)
	{
		planes[i] = (b2CollisionPlane){ { (b2Vec2){ inBuffer[i * 4], inBuffer[i * 4 + 1] }, inBuffer[i * 4 + 2] }, FLT_MAX, 0.0f, inBuffer[i * 4 + 3] != 0.0f };
	}
	b2PlaneSolverResult result = b2SolvePlanes((b2Vec2){ dx, dy }, planes, count);
	free(planes);
	nb_out();
	outBuffer[0] = result.translation.x;
	outBuffer[1] = result.translation.y;
}

typedef struct
{
	Skip skip;
	float fraction;
} CastClosest;

static float castClosest(b2ShapeId id, b2Vec2 point, b2Vec2 normal, float fraction, void* context)
{
	(void)point;
	(void)normal;
	CastClosest* cast = context;
	int slot;
	if (skipped(id, &cast->skip, &slot)) return -1.0f;
	// What it starts inside of is the planes' to push it out of, not the sweep's to stop it at.
	if (fraction <= 0.0f) return -1.0f;
	if (fraction < cast->fraction) cast->fraction = fraction;
	return fraction;
}

// How far along (dx, dy) a capsule goes before it meets something, 0 to 1. Passes by sensors,
// `skipFlags`, `skipShape`, and what it starts inside of.
EXPORT float nb_mover_cast(int world, float x1, float y1, float x2, float y2, float radius, float dx, float dy, int category, int mask, int skipFlags, int skipShape)
{
	b2Vec2 points[2] = { (b2Vec2){ x1, y1 }, (b2Vec2){ x2, y2 } };
	b2ShapeProxy proxy = b2MakeProxy(points, 2, radius);
	CastClosest cast = { { skipFlags | SHAPE_SENSOR, skipShape }, 1.0f };
	b2World_CastShape(unpackWorld(world), &proxy, (b2Vec2){ dx, dy }, queryFilter(category, mask), castClosest, &cast);
	return cast.fraction;
}

typedef struct
{
	Skip skip;
	int count;
} CastGather;

static float castGather(b2ShapeId id, b2Vec2 point, b2Vec2 normal, float fraction, void* context)
{
	CastGather* gather = context;
	int slot;
	if (skipped(id, &gather->skip, &slot)) return -1.0f;
	ensure(&outBuffer, &outCapacity, (gather->count + 1) * 6);
	int at = gather->count * 6;
	outBuffer[at] = fraction;
	outInt(at + 1, slot);
	outBuffer[at + 2] = point.x;
	outBuffer[at + 3] = point.y;
	outBuffer[at + 4] = normal.x;
	outBuffer[at + 5] = normal.y;
	gather->count++;
	// Carries on: the engine picks which of them holds it.
	return 1.0f;
}

// Everything a segment (a character's feet) meets swept along (dx, dy), as [fraction, shape, x, y,
// normalX, normalY] each, in no order. Passes by sensors, `skipFlags` and `skipShape`.
EXPORT int nb_cast_segment(int world, float x1, float y1, float x2, float y2, float dx, float dy, int category, int mask, int skipFlags, int skipShape)
{
	b2Vec2 points[2] = { (b2Vec2){ x1, y1 }, (b2Vec2){ x2, y2 } };
	b2ShapeProxy proxy = b2MakeProxy(points, 2, 0.0f);
	CastGather gather = { { skipFlags | SHAPE_SENSOR, skipShape }, 0 };
	b2World_CastShape(unpackWorld(world), &proxy, (b2Vec2){ dx, dy }, queryFilter(category, mask), castGather, &gather);
	return gather.count;
}

typedef struct
{
	Skip skip;
	bool hit;
	float fraction;
	int shape;
	b2Vec2 point;
	b2Vec2 normal;
} RayClosest;

static float rayClosest(b2ShapeId id, b2Vec2 point, b2Vec2 normal, float fraction, void* context)
{
	RayClosest* ray = context;
	int slot;
	if (skipped(id, &ray->skip, &slot)) return -1.0f;
	if (ray->hit && fraction >= ray->fraction) return ray->fraction;
	ray->hit = true;
	ray->fraction = fraction;
	ray->shape = slot;
	ray->point = point;
	ray->normal = normal;
	return fraction;
}

// The first thing a ray from (x, y) along (dx, dy) meets: 1 and out [fraction, shape, x, y, normalX,
// normalY], or 0. Passes by sensors, `skipFlags` and `skipShape`.
EXPORT int nb_cast_ray(int world, float x, float y, float dx, float dy, int category, int mask, int skipFlags, int skipShape)
{
	RayClosest ray = { { skipFlags | SHAPE_SENSOR, skipShape }, false, 1.0f, -1, { 0.0f, 0.0f }, { 0.0f, 0.0f } };
	b2World_CastRay(unpackWorld(world), (b2Vec2){ x, y }, (b2Vec2){ dx, dy }, queryFilter(category, mask), rayClosest, &ray);
	if (ray.hit == false) return 0;
	nb_out();
	outBuffer[0] = ray.fraction;
	outInt(1, ray.shape);
	outBuffer[2] = ray.point.x;
	outBuffer[3] = ray.point.y;
	outBuffer[4] = ray.normal.x;
	outBuffer[5] = ray.normal.y;
	return 1;
}
