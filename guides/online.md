# Online games

> **Experimental.** `nacatamalon/net` is new: what is here works, and it can still change from one
> version to the next. What it does not do yet is at the [end](#what-it-does-not-do-yet).

An online game in nacatamalon is the game you already know how to write, run in two places: in a
**room** on a server, with no screen and no sound, where what happens is decided, and in **each
player's page**, which shows it and sends what the player does. The scenes are the same in both;
`useNet().role` says which one this is.

```
           player's page                         server
   ┌──────────────────────────┐        ┌──────────────────────────┐
   │ the game's scenes        │  what  │ the same scenes, in a    │
   │ draws, plays sound,      │  they  │ room: no screen, decides │
   │ reads the keys           │ ─────▶ │ who moves, who scores    │
   │ (role 'client')          │ ◀───── │ (role 'server')          │
   └──────────────────────────┘  what  └──────────────────────────┘
                                happened
```

The one rule that keeps it fair: **a player's game says what the player did, never what they got.**
It sends "I pressed fire", not "I hit him"; the server, running the same scene, works out what
came of it and tells everyone. A player who changes their own game only changes their own screen.

- [Your first online game](#your-first-online-game)
- [Objects everyone sees](#objects-everyone-sees)
- [Messages](#messages)
- [Moving in real time](#moving-in-real-time)
- [Shots and hits](#shots-and-hits)
- [Who gets in](#who-gets-in)
- [Choosing what carries the lines](#choosing-what-carries-the-lines)
- [Trying it without the internet](#trying-it-without-the-internet)
- [Putting it online](#putting-it-online)
- [What it does not do yet](#what-it-does-not-do-yet)

## Your first online game

Three files: the game, the player's page and the server. Every player gets a dot with their name
that everyone sees, moved with the arrows.

```ts
// src/game.ts
import { createScene, createShapes, createText, destroy, useTransform, type TActionMap, type TGameObject, type TSceneFn } from 'nacatamalon';
import { useNet, useNetSpawn, useShared, type TNetHandle } from 'nacatamalon/net';

export const SIZE = { width: 320, height: 180 };

// The same on both sides: the server reads each player's actions by these names.
export const ACTIONS: TActionMap = [
    { name: 'left', bindings: [{ type: 'key', key: 'ArrowLeft' }] },
    { name: 'right', bindings: [{ type: 'key', key: 'ArrowRight' }] },
    { name: 'up', bindings: [{ type: 'key', key: 'ArrowUp' }] },
    { name: 'down', bindings: [{ type: 'key', key: 'ArrowDown' }] },
];

const SPEED = 80;

// A player's dot: theirs to move, everyone's to see.
const Dot = (player: string, x: number, y: number) => {
    const place = useTransform({ x, y });
    createShapes({ shapes: [{ type: 'circle', x: 0, y: 0, radius: 4, fill: '#ffd040' }] });
    createText({ text: player, anchor: { x: 0.5, y: 1 }, transform: { y: -6 } });

    return useShared({
        owner: player,
        move: (input, dt) => {
            const { x: dx, y: dy } = input.direction('left', 'right', 'up', 'down');
            place.x += dx * SPEED * dt;
            place.y += dy * SPEED * dt;
        },
    });
};

// The scene, the same in the server's room and in each player's page. `connect` is how a player's
// page reaches the server; the server passes `null`.
export const lobby = (connect: ((net: TNetHandle) => void) | null): TSceneFn => () => {
    const net = useNet();
    const spawnDot = useNetSpawn('dot', Dot);

    if (net.role === 'server') {
        const dots = new Map<string, TGameObject>();
        net.onJoin((player) => dots.set(player, spawnDot(player, 40 + dots.size * 40, 90)));
        net.onLeave((player) => {
            const dot = dots.get(player);
            if (dot !== undefined) destroy(dot);
            dots.delete(player);
        });
    } else {
        connect?.(net);
    }
    return createScene();
};
```

```ts
// src/main.ts
import { createGame } from 'nacatamalon';
import { ACTIONS, lobby, SIZE } from './game';

// A player's page: the game, which connects to the server when its scene starts.
const game = createGame('#app', { ...SIZE, step: 60, actions: ACTIONS });

game({ Lobby: lobby((net) => net.connect('ws://localhost:8080', { room: 'lobby' })) });
```

```ts
// src/server.ts
import { createServer } from 'nacatamalon/net';
import { ACTIONS, lobby, SIZE } from './game';

// The server: the same scene, in a room for each room the players ask for.
const server = createServer({ ...SIZE, scenes: { Lobby: lobby(null) }, step: 60, actions: ACTIONS });

server.listen(8080);
```

Start the server with `bun src/server.ts`, open the game in two windows (an incognito one is a
second player), and move. Node runs the server too: built to JavaScript as the rest of your
project is, or as it is on Node 22.18 or newer, with the imports written with their `.ts`.

What happened:

- `server.listen(8080)` opened a port for WebSockets, in Bun or Node, with nothing to install. The
  page connected with `net.connect('ws://…')`, asking for the room `'lobby'`; the server made the
  room, a game of its own running `Lobby`, and let the player in.
- The server heard `onJoin` and made a dot with `spawnDot`. The spawner made the same dot in every
  player's page, with the same arguments, and makes it for whoever comes later too.
- `useShared` made the dot's placement travel: the server moves it, and every page shows it there a
  moment later. With `owner` and `move`, the owner's page also moves it **at once** with its own
  keys, and quietly takes the server's word when it comes: see [Moving in real time](#moving-in-real-time).

## Objects everyone sees

An object is shared with `useShared` in its own body. There are two kinds:

- **Made while the game runs** (an avatar, a bullet, a coin): made with a spawner,
  `useNetSpawn('coin', Coin)`. Both sides call `useNetSpawn` with the same name, because the scenes
  are the same, but **only the server spawns**. The arguments travel, so they are plain data: a
  name, a number, a colour. When the server destroys the object, it goes from every page.
- **Built by every game itself** (a door in the scene, a scoreboard): `useShared({ key: 'door' })`.
  The same key on both sides is how they match.

`fields` is what travels besides the placement. The server writes them; the pages read them a
moment later.

```ts
import { createScene, createText, useUpdate, type TSceneFn } from 'nacatamalon';
import { useNet, useShared } from 'nacatamalon/net';

// A sign every game builds itself, and the server keeps.
const Sign = () => {
    const label = createText({ text: '' });
    const sign = useShared({ key: 'sign', fields: { players: 0 } });
    useUpdate(() => {
        label.text = `${sign.fields.players} IN THE ROOM`;
    });
    return sign;
};

export const Lobby: TSceneFn = () => {
    const net = useNet();
    const sign = Sign();

    if (net.role === 'server') {
        net.onJoin(() => {
            sign.fields.players += 1;
        });
        net.onLeave(() => {
            sign.fields.players -= 1;
        });
    }
    return createScene();
};
```

`smooth: false` makes an object jump to each place the server says, with no wait, instead of
gliding.

## Messages

For what is not an object's place or fields, send a message: `net.send(type, data)` from a player's
page, heard on the server with `net.onMessage(type, (data, from) => …)`, where `from` is the player.
The server answers one player with `net.sendTo(player, type, data)` or everyone with
`net.broadcast(type, data)`.

```ts
import { createScene, createText, useKeyboard, useUpdate, type TSceneFn } from 'nacatamalon';
import { useRandom } from 'nacatamalon/math';
import { useNet } from 'nacatamalon/net';

export const Pond: TSceneFn = () => {
    const net = useNet();

    if (net.role === 'server') {
        const random = useRandom();
        const coins = new Map<string, number>();
        net.onJoin((player) => coins.set(player, 100));
        // The player said "I pulled"; whether a fish bit is decided here, with the server's own luck.
        net.onMessage('pull', (_data, from) => {
            if (from === null || !random.chance(0.5)) return;
            const now = (coins.get(from) ?? 0) + 10;
            coins.set(from, now);
            net.sendTo(from, 'coins', now);
            net.broadcast('news', `${from} caught a fish`);
        });
    } else {
        const label = createText({ text: 'COINS 100' });
        const keys = useKeyboard();
        net.onMessage<number>('coins', (amount) => {
            label.text = `COINS ${amount}`;
        });
        useUpdate(() => {
            if (net.status === 'online' && keys.justPressed(' ')) net.send('pull');
        });
    }
    return createScene();
};
```

Messages are JSON. Everything that arrives (a message, a player coming or going) is handed over at
the start of a step, before any update, in the order it came. `net.players`, `net.me`, `net.status`
and `net.ping` say who is in, who this page is, how the line is and how long a word takes there and
back. A page hears `onConnect` when it is let in and has the whole room (its objects where they
are, its room stores), and `onDisconnect(reason)` when the line goes.

Luck on the server is `useRandom()`, never `Math.random()`: the room's luck is its own.

## What a room keeps

A score, a round, whose turn it is: data of the whole room, not of one object. A store of the game
(`createGameStore`) will not do here: it is one object for everything that imports it, so in a
server with many rooms every room would write on the same one. A **room store** is declared once
and each game has its own: the room changes it, every player sees it a moment later, read only.

```ts
import { createScene, createText, type TSceneFn } from 'nacatamalon';
import { createRoomStore, useNet, useRoomStore } from 'nacatamalon/net';

// stores/score.ts: a plan, holding nothing; each game asks for its own.
export const score = createRoomStore({ key: 'score', state: { red: 0, blue: 0 } });

export const Match: TSceneFn = () => {
    const net = useNet();
    const board = useRoomStore(score);
    const label = createText({ text: '0 - 0' });
    board.watch((s) => `${s.red} - ${s.blue}`, (text) => {
        label.text = text;
    });

    if (board.writable) {
        net.onMessage<'red' | 'blue'>('goal', (team) => {
            board.set((s) => {
                s[team] += 1;
            });
            // The players read the new score when they hear this: what a store changed is sent
            // before anything the room says after it.
            net.broadcast('goal', team);
        });
    }
    return createScene();
};
```

- `useRoomStore` is asked for while something is being built (a scene, an object, a game system);
  keep what it gives. From the server's own code it is `room.store(score)`, and from a page's HUD
  over the game, `await roomStoreOf(game, score)`.
- `state` is frozen: change it with `set`, which works on a copy (if it throws, nothing changes).
  It holds plain data, as it travels.
- `writable` is `true` in the room, and in a game that has never connected: a game tried on its
  own changes its own, and the room's replaces it when it connects.
- `serverOnly: true` keeps a store in the room (the rules, what is kept when the room ends). What
  belongs to one player goes to them with `sendTo`.
- A player hears `onConnect` once it has the whole room, its stores among it: reading the score
  there reads the room's.
- A room that `createServer` ends when its last player goes takes its stores with it.

## Moving in real time

What makes it feel right:

- **The player's own object is predicted.** With `owner` and `move`, the owner's page runs `move`
  with its own keys at once, while the server runs the same `move` with the keys it was sent.
  When the server's word comes back, the page goes back to where the server had it and replays what
  the server had not seen yet. If both agree, which is nearly always, nothing shows. So `move`
  only moves (it can run several times in one frame on a correction): no sounds, no spawning, no
  score in it.
- **The others are shown a moment late, gliding.** The page keeps what the server said and shows
  it a little behind, sliding from one word to the next, so a late message never makes anything
  jump. That moment is the **interpolation**. Left alone it follows the line (about 0.04 s on a
  good one, never over 0.3). `connect(to, { interpolation: 0.05 })` fixes it; less is fresher and
  shakier, and 0 shows each word as it comes.
- **How often the server tells them.** `sendRate` is how many times a second the server sends
  where things are: `step` up to 30 unless you say. 60 is smoother for a fast game and costs twice
  the line.

```ts
import { createServer } from 'nacatamalon/net';
import { ACTIONS, lobby, SIZE } from './game';

// A fast game: 60 steps a second, and the players told after every one.
const server = createServer({ ...SIZE, scenes: { Lobby: lobby(null) }, step: 60, sendRate: 60, actions: ACTIONS });

server.listen(8080);
```

A slow game (walking about a room and talking) is well served by `step: 20`.

## Shots and hits

A shot is decided on the server, in an update, from the player's actions: `net.actions(player)`
is the same handle `useActions` gives, filled from that player's machine.

But by the time "fire" arrives, the others have moved on: the player aimed at where they **saw**
them, a moment ago. `net.rewind(player, fn)` runs `fn` with every shared object back where that
player saw it, then puts everything back.

```ts
import { useUpdate, type TGameObject } from 'nacatamalon';
import { useNet, type TShared } from 'nacatamalon/net';

const REACH = 24;

// The server's rules, in a component of the scene. `fighters` are the players' objects, each made
// with a spawner and keeping its score in `fields`.
export const useShots = (fighters: Map<string, TGameObject<TShared<{ score: number }>>>) => {
    const net = useNet();
    useUpdate(() => {
        if (net.role !== 'server') return;
        for (const [player, fighter] of fighters) {
            if (!net.actions(player).justPressed('fire')) continue;
            // Where the others were on this player's screen when they pressed, not where they are now.
            const hit = net.rewind(player, () => [...fighters].filter(([other, them]) => other !== player
                && Math.hypot(them.transform!.x - fighter.transform!.x, them.transform!.y - fighter.transform!.y) <= REACH));
            fighter.api.fields.score += hit.length;
        }
    });
};
```

`rewindLimit` on the server says how far back it may look (0.25 s unless you say, at most 1): a
player further away than that hits a little behind. A changed game cannot pick how far back its
shots look. Only placements go back; a physics world does not.

## Who gets in

A page can send a token when it connects, `net.connect(to, { room, token })`, and the server's
`admit` decides: `true` lets them in with a name the room gives, a string lets them in under that
name (their account's, so they are the same player each time), `false` keeps them out. It may be
`async`, asking your own accounts.

```ts
import { createServer } from 'nacatamalon/net';
import { ACTIONS, lobby, SIZE } from './game';

declare function accountOf(token: string | null): Promise<{ name: string } | null>;

const server = createServer({
    ...SIZE,
    scenes: { Lobby: lobby(null) },
    step: 60,
    actions: ACTIONS,
    admit: async ({ token }) => (await accountOf(token))?.name ?? false,
});

server.listen(8080);
```

Accounts, passwords and databases are the game's own: the engine only carries the token and asks.
`roomScene` picks which scene a room runs by its name (`'pool'` runs `'Pool'`); `net.kick(player)`
sends someone out.

## When the room changes its scene

A room changes its scene as any game does, with `useScene().change` in the server's code: from the
locker room to the match, from the round to the podium. Its players follow it on their own, in the
same room and on the same line, and hear `onConnect` in the new scene once it is whole there.

```ts
import { createScene, useScene, type TSceneFn } from 'nacatamalon';
import { useNet } from 'nacatamalon/net';
import { fade } from 'nacatamalon/transitions';

export const LockerRoom: TSceneFn = () => {
    const net = useNet();
    const scene = useScene();
    if (net.role === 'server') {
        // The room decides; every player in the locker room goes with it.
        net.onMessage('ready', () => scene.change('Match'));
    } else if (net.status === 'offline') {
        // How this page follows the room's changes of scene: transitions do not travel.
        net.connect('wss://example.com', { room: 'main', sceneTransition: fade(0.3) });
    }
    return createScene();
};

export const Match: TSceneFn = () => {
    const net = useNet();
    // What is done on arriving: the match whole, its objects and its stores.
    net.onConnect(() => console.log(`the match, in ${net.room}`));
    return createScene();
};
```

- Only a page in the room's scene follows it; `net.scene` says which that is. A page that connected
  from a menu stays there, and goes to it with `useScene().change(net.scene)` in its `onConnect`.
- The room, its players and the player's name stay. Nobody hears `onLeave` or `onDisconnect`; the
  room's stores stay `ready`. What the old scene shared goes, and a HUD's shared objects stay.
- The new scene hears `onConnect` and an `onJoin` for everyone there; a HUD hears `onConnect` again,
  and only who really comes and goes.
- Meanwhile `status` is `'connecting'` and what is sent is let go, as with `joinRoom`.
- A page that does not have the room's new scene, or whose new scene throws, closes its line with
  why. A room scene that throws on the server is said there, and its players stay where they were.

## Moving between rooms

A game of places (a lobby, a pool, someone's room) makes each place a room of the server, with its
own scene (`roomScene`). `net.joinRoom(room)` moves the player there over the line it is on: the
server asks `admit` (with `from`, where the player comes from), and only once the new room takes it
does the old one let it go, so a player turned away is where it was, as it was.

```ts
import { createScene, useKeyboard, useUpdate, type TSceneFn } from 'nacatamalon';
import { useNet } from 'nacatamalon/net';
import { fade } from 'nacatamalon/transitions';

export const Lobby: TSceneFn = () => {
    const net = useNet();
    const keys = useKeyboard();
    useUpdate(() => {
        // At the door, a key takes the player to the pool.
        if (net.role !== 'client' || net.status !== 'online' || !keys.justPressed('Enter')) return;
        net.joinRoom('pool', { transition: fade(0.3) }).catch((reason) => {
            // Turned away, still in the lobby; or the line closed. Only say it: by now the
            // scene may be another.
            console.log(String(reason));
        });
    });
    return createScene();
};

export const Pool: TSceneFn = () => {
    const net = useNet();
    // What is done on arriving: here the pool is whole, its objects and its stores.
    net.onConnect(() => console.log(`in ${net.room} with ${net.players.join(', ')}`));
    return createScene();
};
```

- The player goes from the scene of its room to the scene of the new one, as `useScene().change`
  would, with `transition` if given; the same scene in both is started again.
- The room it leaves hears `onLeave`, and so does every listener still running here (a HUD);
  nobody hears `onDisconnect`. The new room hears `onJoin`, and the player hears `onConnect` and
  an `onJoin` for everyone there, as when it connects.
- The new scene's body runs before its room is here: what it does on arriving goes in
  `onConnect`. Meanwhile `status` is `'connecting'` and what is sent is let go, so a game should not
  change scenes on `status !== 'online'`, but on `onDisconnect`.
- What the old room shared goes; a HUD's shared objects stay and take the new room's fields.
- Called from a scene that is not its room's (a menu that connected), it throws: change to the
  room's scene first. The promise fails with the line closed when the new room's scene does not
  start in the page, and the page hears `onDisconnect` with why.
- Only between rooms of one `createServer`: a room of a server of your own (`createRoom`) answers
  that it does not move players.

## Choosing what carries the lines

The engine does not care what carries the messages: anything that takes text both ways is a
connection, four functions (`send`, `onMessage`, `onClose`, `close`). On the server, each one is
handed to `server.accept`; in the page, to `net.connect`. Pick what you already use:

| Carried by | Server | Player's page |
|---|---|---|
| The engine's own WebSocket | `server.listen(8080)` | `net.connect('ws://…')` |
| `ws` | each socket to `server.accept(webSocketConnection(socket))` | `net.connect('ws://…')` |
| socket.io | each socket, wrapped | socket.io's client, wrapped |
| Colyseus | its room runs `createRoom` | its room, wrapped |
| WebRTC, page to page | one player's page runs `createServer` | a data channel, wrapped |

**`ws`**, a WebSocket server of your own (behind your own HTTP server, say):

```ts
import { WebSocketServer } from 'ws';
import { createServer, webSocketConnection } from 'nacatamalon/net';
import { ACTIONS, lobby, SIZE } from './game';

const server = createServer({ ...SIZE, scenes: { Lobby: lobby(null) }, step: 60, actions: ACTIONS });

// `ws`'s socket is a WebSocket, though its types are not the browser's.
new WebSocketServer({ port: 8080 }).on('connection', (socket: unknown) => server.accept(webSocketConnection(socket as WebSocket)));
```

**socket.io**, its socket wrapped on an event of its own, the same on both sides:

```ts
import { Server } from 'socket.io';
import { createServer } from 'nacatamalon/net';
import { ACTIONS, lobby, SIZE } from './game';

type Socket = { emit(event: string, text: string): void; on(event: string, listener: (text: string) => void): void; disconnect(close?: boolean): void };

const server = createServer({ ...SIZE, scenes: { Lobby: lobby(null) }, step: 60, actions: ACTIONS });

new Server(8080, { cors: { origin: '*' } }).on('connection', (socket: Socket) => server.accept({
    send: (text) => socket.emit('naca', text),
    onMessage: (listener) => socket.on('naca', listener),
    onClose: (listener) => socket.on('disconnect', listener),
    close: () => socket.disconnect(true),
}));
```

```ts
import { createGame } from 'nacatamalon';
import { io } from 'socket.io-client';
import { ACTIONS, lobby, SIZE } from './game';

const game = createGame('#app', { ...SIZE, step: 60, actions: ACTIONS });

game({
    Lobby: lobby((net) => {
        const socket = io('http://localhost:8080', { transports: ['websocket'] });
        net.connect({
            send: (text) => socket.emit('naca', text),
            onMessage: (listener) => socket.on('naca', listener),
            onClose: (listener) => socket.on('disconnect', (reason: string) => listener(reason)),
            close: () => socket.disconnect(),
        }, { room: 'lobby' });
    }),
});
```

**Colyseus** holds the rooms itself, so each of its rooms holds one of the engine's, made with
`createRoom`, and lets its players into it. The engine's room keeps its own time: do not step it
from Colyseus's simulation interval, whose ticks come a little slower than asked.

```ts
import { Room, Server, type Client } from 'colyseus';
import { createRoom, type TNetConnection } from 'nacatamalon/net';
import { ACTIONS, lobby, SIZE } from './game';

class Lobby extends Room {
    game = createRoom({ ...SIZE, scenes: { Lobby: lobby(null) }, step: 60, actions: ACTIONS, name: 'lobby' });
    hear = new Map<string, (text: string) => void>();
    gone = new Map<string, (reason?: string) => void>();

    onCreate() {
        this.onMessage('naca', (client: Client, text: string) => this.hear.get(client.sessionId)?.(text));
    }

    onJoin(client: Client) {
        const line: TNetConnection = {
            send: (text) => client.send('naca', text),
            onMessage: (listener) => { this.hear.set(client.sessionId, listener); },
            onClose: (listener) => { this.gone.set(client.sessionId, listener); },
            close: () => client.leave(),
        };
        this.game.join(line, client.sessionId);
    }

    onLeave(client: Client) {
        this.gone.get(client.sessionId)?.('left');
        this.hear.delete(client.sessionId);
        this.gone.delete(client.sessionId);
    }

    onDispose() {
        this.game.destroy();
    }
}

const colyseus = new Server();
colyseus.define('lobby', Lobby);
void colyseus.listen(2567);
```

In the page, Colyseus's client finds the room (`joinOrCreate('lobby')`), and that room, wrapped the
same way as socket.io's socket on the message `'naca'`, is the connection. Until the room is found,
keep what the game sends and send it then, in order.

**WebRTC, with no game server.** A server can run in a page: one player **hosts**, running
`createServer` in their own page and playing in it over `connectLoopback(server)`, and the others
connect straight to that page over a WebRTC data channel, wrapped like any other line. The two pages
need a small server of yours only to find each other (to pass WebRTC's offer, answer and addresses);
the game never goes through it. On one machine or a home network nothing else is needed; across the
internet, add a STUN server (and for some networks a TURN one) to `RTCPeerConnection`. The host's
window has to stay visible (a browser slows a hidden tab's timers to about once a second), and the
host has the last word, so they could cheat: for a game where that matters, put the room on a server.

```ts
import type { TNetConnection } from 'nacatamalon/net';

// A data channel as a connection. What is sent before it opens waits until it does.
export const channelLine = (channel: RTCDataChannel): TNetConnection => {
    const waiting: string[] = [];
    channel.addEventListener('open', () => {
        for (const text of waiting.splice(0)) channel.send(text);
    });
    return {
        send: (text) => (channel.readyState === 'open' ? channel.send(text) : waiting.push(text)),
        onMessage: (listener) => channel.addEventListener('message', (event) => listener(String(event.data))),
        onClose: (listener) => channel.addEventListener('close', () => listener('the other player is gone')),
        close: () => channel.close(),
    };
};
```

## Trying it without the internet

`connectLoopback(server, { delay })` is a line in memory to a server in the same page or process:
the server and every player in one page, with a slow line if you want one (`delay: 0.05` is a
player 50 ms away each way). It is how to see the game with lag while you make it.

```ts
import { createGame } from 'nacatamalon';
import { connectLoopback, createServer } from 'nacatamalon/net';
import { ACTIONS, lobby, SIZE } from './game';

const server = createServer({ ...SIZE, scenes: { Lobby: lobby(null) }, step: 60, actions: ACTIONS });

// Two players side by side in this page, each 60 ms from the server.
for (const id of ['#left', '#right']) {
    const game = createGame(id, { ...SIZE, step: 60, actions: ACTIONS });
    game({ Lobby: lobby((net) => net.connect(connectLoopback(server, { delay: 0.06 }), { room: 'lobby' })) });
}
```

The same works in a test with no browser: `createHeadlessGame` from `nacatamalon/headless` runs a
player's game a frame at a time, so a test can start the real server, connect two players and
check that both see both dots. In the nacatamalon editor, the **Online** button plays the game with
its server (`src/server.ts`) and up to four players side by side, with a slow line to try.

## Putting it online

- **The server** is a program that keeps running: any machine or host that runs Bun or Node for
  as long as you like (not one that runs a function per request and stops). `listen` takes the
  port the host gives.
- **`wss://`**: a page served over `https://` may only connect to `wss://`. Put the server behind
  whatever gives your site its certificate (most hosts do it for you, or a proxy in front), and
  connect to `wss://your-address`.
- **The page** is the game as you always publish it; only its address for the server changes.
- **Accounts** are yours: your login gives the page a token, the page sends it with `connect`, and
  `admit` checks it.

## What it does not do yet

It is experimental, and these are known:

- **A correction jumps.** When the server corrects a player's own object, which is rare, it goes
  to the right place at once rather than gliding there.
- Messages are JSON text; there is no binary form yet.
- **A room's scene that throws while a player moves to it** closes the player's line, as it should,
  but what it built of itself before throwing stays shared in the page: fix the scene.
