# Juegos en línea

> **Experimental.** `nacatamalon/net` es nuevo: lo que hay funciona, y todavía puede cambiar de una
> versión a otra. Lo que aún no hace está al [final](#lo-que-todavía-no-hace).

Un juego en línea en nacatamalon es el juego que ya sabes escribir, corriendo en dos sitios: en una
**sala** de un servidor, sin pantalla ni sonido, donde se decide lo que pasa, y en **la página de
cada jugador**, que lo enseña y manda lo que el jugador hace. Las escenas son las mismas en los dos;
`useNet().role` dice en cuál estás.

```
         página del jugador                       servidor
   ┌──────────────────────────┐        ┌──────────────────────────┐
   │ las escenas del juego    │  lo que│ las mismas escenas, en   │
   │ dibuja, suena,           │  hizo  │ una sala: sin pantalla,  │
   │ lee las teclas           │ ─────▶ │ decide quién se mueve    │
   │ (role 'client')          │ ◀───── │ y quién gana (role       │
   └──────────────────────────┘ lo que │ 'server')                │
                                 pasó  └──────────────────────────┘
```

La regla que lo mantiene justo: **el juego de un jugador dice lo que el jugador hizo, nunca lo que
consiguió.** Manda "pulsé disparar", no "le di"; el servidor, con la misma escena, decide qué salió
de eso y se lo dice a todos. Un jugador que cambia su propio juego solo cambia su propia pantalla.

- [Tu primer juego en línea](#tu-primer-juego-en-línea)
- [Objetos que todos ven](#objetos-que-todos-ven)
- [Mensajes](#mensajes)
- [Moverse en tiempo real](#moverse-en-tiempo-real)
- [Disparos y golpes](#disparos-y-golpes)
- [Quién entra](#quién-entra)
- [Elegir por dónde van las líneas](#elegir-por-dónde-van-las-líneas)
- [Probarlo sin internet](#probarlo-sin-internet)
- [Ponerlo en internet](#ponerlo-en-internet)
- [Lo que todavía no hace](#lo-que-todavía-no-hace)

## Tu primer juego en línea

Tres archivos: el juego, la página del jugador y el servidor. Cada jugador tiene un punto con su
nombre que todos ven, y lo mueve con las flechas.

```ts
// src/game.ts
import { createScene, createShapes, createText, destroy, useTransform, type TActionMap, type TGameObject, type TSceneFn } from 'nacatamalon';
import { useNet, useNetSpawn, useShared, type TNetHandle } from 'nacatamalon/net';

export const SIZE = { width: 320, height: 180 };

// Las mismas en los dos lados: el servidor lee las acciones de cada jugador por estos nombres.
export const ACTIONS: TActionMap = [
    { name: 'left', bindings: [{ type: 'key', key: 'ArrowLeft' }] },
    { name: 'right', bindings: [{ type: 'key', key: 'ArrowRight' }] },
    { name: 'up', bindings: [{ type: 'key', key: 'ArrowUp' }] },
    { name: 'down', bindings: [{ type: 'key', key: 'ArrowDown' }] },
];

const SPEED = 80;

// El punto de un jugador: suyo para moverlo, de todos para verlo.
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

// La escena, la misma en la sala del servidor y en la página de cada jugador. `connect` es cómo la
// página de un jugador llega al servidor; el servidor pasa `null`.
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

// La página de un jugador: el juego, que se conecta al servidor cuando empieza su escena.
const game = createGame('#app', { ...SIZE, step: 60, actions: ACTIONS });

game({ Lobby: lobby((net) => net.connect('ws://localhost:8080', { room: 'lobby' })) });
```

```ts
// src/server.ts
import { createServer } from 'nacatamalon/net';
import { ACTIONS, lobby, SIZE } from './game';

// El servidor: la misma escena, en una sala por cada sala que piden los jugadores.
const server = createServer({ ...SIZE, scenes: { Lobby: lobby(null) }, step: 60, actions: ACTIONS });

server.listen(8080);
```

Arranca el servidor con `bun src/server.ts`, abre el juego en dos ventanas (una de incógnito es un
segundo jugador) y muévete. Node también lo arranca: compilado a JavaScript como el resto de tu
proyecto, o tal cual en Node 22.18 o más nuevo, con los imports escritos con su `.ts`.

Qué pasó:

- `server.listen(8080)` abrió un puerto para WebSockets, en Bun o en Node, sin instalar nada. La
  página se conectó con `net.connect('ws://…')` pidiendo la sala `'lobby'`; el servidor hizo la
  sala, un juego propio que corre `Lobby`, y dejó entrar al jugador.
- El servidor oyó `onJoin` e hizo un punto con `spawnDot`. El spawner hizo el mismo punto en la
  página de cada jugador, con los mismos argumentos, y también lo hace para quien llegue después.
- `useShared` hizo que la posición del punto viaje: el servidor lo mueve y cada página lo enseña ahí
  un momento después. Con `owner` y `move`, la página del dueño además lo mueve **al instante** con
  sus propias teclas, y acepta sin que se note lo que diga el servidor cuando llega: mira
  [Moverse en tiempo real](#moverse-en-tiempo-real).

## Objetos que todos ven

Un objeto se comparte con `useShared` en su propio cuerpo. Hay dos clases:

- **Hechos mientras el juego corre** (un avatar, una bala, una moneda): se hacen con un spawner,
  `useNetSpawn('coin', Coin)`. Los dos lados llaman a `useNetSpawn` con el mismo nombre, porque
  las escenas son las mismas, pero **solo el servidor los crea**. Los argumentos viajan, así que son
  datos simples: un nombre, un número, un color. Cuando el servidor destruye el objeto, se va de
  todas las páginas.
- **Hechos por cada juego** (una puerta de la escena, un marcador): `useShared({ key: 'door' })`.
  La misma clave en los dos lados es cómo se emparejan.

`fields` es lo que viaja además de la posición. El servidor lo escribe; las páginas lo leen un
momento después.

```ts
import { createScene, createText, useUpdate, type TSceneFn } from 'nacatamalon';
import { useNet, useShared } from 'nacatamalon/net';

// Un cartel que cada juego hace, y que el servidor lleva.
const Sign = () => {
    const label = createText({ text: '' });
    const sign = useShared({ key: 'sign', fields: { players: 0 } });
    useUpdate(() => {
        label.text = `${sign.fields.players} EN LA SALA`;
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

`smooth: false` hace que un objeto salte a cada sitio que dice el servidor, sin esperar, en vez de
deslizarse.

## Mensajes

Para lo que no es la posición o los campos de un objeto, manda un mensaje: `net.send(tipo, datos)`
desde la página de un jugador, que el servidor oye con `net.onMessage(tipo, (datos, from) => …)`,
donde `from` es el jugador. El servidor contesta a uno con `net.sendTo(jugador, tipo, datos)` o a
todos con `net.broadcast(tipo, datos)`.

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
        // El jugador dijo "tiré"; si picó un pez se decide aquí, con la suerte del propio servidor.
        net.onMessage('pull', (_data, from) => {
            if (from === null || !random.chance(0.5)) return;
            const now = (coins.get(from) ?? 0) + 10;
            coins.set(from, now);
            net.sendTo(from, 'coins', now);
            net.broadcast('news', `${from} pescó un pez`);
        });
    } else {
        const label = createText({ text: 'MONEDAS 100' });
        const keys = useKeyboard();
        net.onMessage<number>('coins', (amount) => {
            label.text = `MONEDAS ${amount}`;
        });
        useUpdate(() => {
            if (net.status === 'online' && keys.justPressed(' ')) net.send('pull');
        });
    }
    return createScene();
};
```

Los mensajes son JSON. Todo lo que llega (un mensaje, un jugador que entra o sale) se entrega al
empezar un paso, antes de cualquier update, en el orden en que llegó. `net.players`, `net.me`,
`net.status` y `net.ping` dicen quién está, quién es esta página, cómo está la línea y cuánto tarda
una palabra en ir y volver. Una página oye `onConnect` cuando la dejan entrar y
`onDisconnect(reason)` cuando se va la línea.

La suerte en el servidor es `useRandom()`, nunca `Math.random()`: la suerte de la sala es suya.

## Moverse en tiempo real

Lo que hace que se sienta bien:

- **El objeto propio del jugador se predice.** Con `owner` y `move`, la página del dueño corre
  `move` con sus teclas al instante, mientras el servidor corre el mismo `move` con las teclas que
  le llegaron. Cuando vuelve la palabra del servidor, la página vuelve a donde el servidor lo tenía
  y repite lo que el servidor aún no había visto. Si coinciden, que es casi siempre, no se nota
  nada. Por eso `move` solo mueve (puede correr varias veces en un fotograma al corregir): nada de
  sonidos, ni de crear cosas, ni de puntos ahí dentro.
- **A los demás se les ve un momento tarde, deslizándose.** La página guarda lo que dijo el
  servidor y lo enseña un poco por detrás, pasando de una palabra a la siguiente, para que un
  mensaje tardío nunca haga saltar nada. Ese momento es la **interpolación** (el colchón). Si no la
  tocas, sigue a la línea (unos 0,04 s en una buena, nunca más de 0,3).
  `connect(to, { interpolation: 0.05 })` la fija; menos es más fresco y más tembloroso, y 0 enseña
  cada palabra según llega.
- **Cada cuánto avisa el servidor.** `sendRate` es cuántas veces por segundo el servidor manda
  dónde están las cosas: `step` hasta 30 si no dices nada. 60 es más suave para un juego rápido y
  gasta el doble de línea.

```ts
import { createServer } from 'nacatamalon/net';
import { ACTIONS, lobby, SIZE } from './game';

// Un juego rápido: 60 pasos por segundo, y los jugadores avisados después de cada uno.
const server = createServer({ ...SIZE, scenes: { Lobby: lobby(null) }, step: 60, sendRate: 60, actions: ACTIONS });

server.listen(8080);
```

Para un juego tranquilo (pasear por una sala y charlar), `step: 20` va de sobra.

## Disparos y golpes

Un disparo se decide en el servidor, en un update, con las acciones del jugador:
`net.actions(player)` es el mismo handle que da `useActions`, lleno desde la máquina de ese jugador.

Pero cuando "disparar" llega, los demás ya se han movido: el jugador apuntó a donde los **veía**, un
momento antes. `net.rewind(player, fn)` corre `fn` con cada objeto compartido de vuelta donde ese
jugador lo veía, y luego lo devuelve todo a su sitio.

```ts
import { useUpdate, type TGameObject } from 'nacatamalon';
import { useNet, type TShared } from 'nacatamalon/net';

const REACH = 24;

// Las reglas del servidor, en un componente de la escena. `fighters` son los objetos de los
// jugadores, cada uno hecho con un spawner y con sus puntos en `fields`.
export const useShots = (fighters: Map<string, TGameObject<TShared<{ score: number }>>>) => {
    const net = useNet();
    useUpdate(() => {
        if (net.role !== 'server') return;
        for (const [player, fighter] of fighters) {
            if (!net.actions(player).justPressed('fire')) continue;
            // Donde estaban los demás en la pantalla de este jugador cuando pulsó, no donde están ahora.
            const hit = net.rewind(player, () => [...fighters].filter(([other, them]) => other !== player
                && Math.hypot(them.transform!.x - fighter.transform!.x, them.transform!.y - fighter.transform!.y) <= REACH));
            fighter.api.fields.score += hit.length;
        }
    });
};
```

`rewindLimit` en el servidor dice hasta dónde puede mirar atrás (0,25 s si no dices nada, como
mucho 1): un jugador más lejos que eso acierta un poco por detrás. Un juego modificado no puede
elegir hasta dónde miran atrás sus disparos. Solo vuelven atrás las posiciones; un mundo de física
no.

## Quién entra

Una página puede mandar un token al conectarse, `net.connect(to, { room, token })`, y el `admit`
del servidor decide: `true` la deja entrar con un nombre que da la sala, un texto la deja entrar con
ese nombre (el de su cuenta, para que sea el mismo jugador cada vez), `false` la deja fuera. Puede
ser `async`, y preguntar a tus propias cuentas.

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

Las cuentas, las contraseñas y las bases de datos son del juego: el motor solo lleva el token y
pregunta. `roomScene` elige qué escena corre una sala según su nombre (`'pool'` corre `'Pool'`);
`net.kick(player)` echa a alguien.

## Elegir por dónde van las líneas

Al motor le da igual qué lleve los mensajes: cualquier cosa que lleve texto en los dos sentidos es
una conexión, cuatro funciones (`send`, `onMessage`, `onClose`, `close`). En el servidor, cada una
se le da a `server.accept`; en la página, a `net.connect`. Elige lo que ya uses:

| Por | Servidor | Página del jugador |
|---|---|---|
| El WebSocket del propio motor | `server.listen(8080)` | `net.connect('ws://…')` |
| `ws` | cada socket a `server.accept(webSocketConnection(socket))` | `net.connect('ws://…')` |
| socket.io | cada socket, envuelto | el cliente de socket.io, envuelto |
| Colyseus | su sala corre `createRoom` | su sala, envuelta |
| WebRTC, de página a página | la página de un jugador corre `createServer` | un canal de datos, envuelto |

**`ws`**, un servidor de WebSocket propio (detrás de tu propio servidor HTTP, por ejemplo):

```ts
import { WebSocketServer } from 'ws';
import { createServer, webSocketConnection } from 'nacatamalon/net';
import { ACTIONS, lobby, SIZE } from './game';

const server = createServer({ ...SIZE, scenes: { Lobby: lobby(null) }, step: 60, actions: ACTIONS });

// El socket de `ws` es un WebSocket, aunque sus tipos no son los del navegador.
new WebSocketServer({ port: 8080 }).on('connection', (socket: unknown) => server.accept(webSocketConnection(socket as WebSocket)));
```

**socket.io**, su socket envuelto en un evento propio, igual en los dos lados:

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

**Colyseus** lleva las salas él mismo, así que cada sala suya lleva una del motor, hecha con
`createRoom`, y deja entrar en ella a sus jugadores. La sala del motor lleva su propio reloj: no la
avances desde el intervalo de simulación de Colyseus, cuyos ticks llegan un poco más lentos de lo
pedido.

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

En la página, el cliente de Colyseus encuentra la sala (`joinOrCreate('lobby')`), y esa sala,
envuelta igual que el socket de socket.io con el mensaje `'naca'`, es la conexión. Hasta que la
sala aparezca, guarda lo que el juego mande y mándalo entonces, en orden.

**WebRTC, sin servidor de juego.** Un servidor puede correr en una página: un jugador **aloja**
la partida, corriendo `createServer` en su propia página y jugando en ella con
`connectLoopback(server)`, y los demás se conectan directamente a esa página por un canal de datos
de WebRTC, envuelto como cualquier otra línea. Las dos páginas solo necesitan un servidor pequeño
tuyo para encontrarse (para pasarse la oferta, la respuesta y las direcciones de WebRTC); el juego
nunca pasa por él. En una misma máquina o en la red de casa no hace falta nada más; por internet,
añade un servidor STUN (y en algunas redes uno TURN) a `RTCPeerConnection`. La ventana de quien
aloja tiene que quedar visible (el navegador frena los temporizadores de una pestaña oculta a una
vez por segundo más o menos), y quien aloja tiene la última palabra, así que podría hacer trampas:
para un juego donde eso importe, pon la sala en un servidor.

```ts
import type { TNetConnection } from 'nacatamalon/net';

// Un canal de datos como conexión. Lo que se manda antes de que abra espera a que abra.
export const channelLine = (channel: RTCDataChannel): TNetConnection => {
    const waiting: string[] = [];
    channel.addEventListener('open', () => {
        for (const text of waiting.splice(0)) channel.send(text);
    });
    return {
        send: (text) => (channel.readyState === 'open' ? channel.send(text) : waiting.push(text)),
        onMessage: (listener) => channel.addEventListener('message', (event) => listener(String(event.data))),
        onClose: (listener) => channel.addEventListener('close', () => listener('el otro jugador se fue')),
        close: () => channel.close(),
    };
};
```

## Probarlo sin internet

`connectLoopback(server, { delay })` es una línea en memoria a un servidor en la misma página o el
mismo proceso: el servidor y todos los jugadores en una página, con una línea lenta si quieres
(`delay: 0.05` es un jugador a 50 ms en cada sentido). Es la forma de ver el juego con retraso
mientras lo haces.

```ts
import { createGame } from 'nacatamalon';
import { connectLoopback, createServer } from 'nacatamalon/net';
import { ACTIONS, lobby, SIZE } from './game';

const server = createServer({ ...SIZE, scenes: { Lobby: lobby(null) }, step: 60, actions: ACTIONS });

// Dos jugadores uno al lado del otro en esta página, cada uno a 60 ms del servidor.
for (const id of ['#left', '#right']) {
    const game = createGame(id, { ...SIZE, step: 60, actions: ACTIONS });
    game({ Lobby: lobby((net) => net.connect(connectLoopback(server, { delay: 0.06 }), { room: 'lobby' })) });
}
```

Lo mismo funciona en un test sin navegador: `createHeadlessGame` de `nacatamalon/headless` corre el
juego de un jugador fotograma a fotograma, así que un test puede arrancar el servidor de verdad,
conectar a dos jugadores y comprobar que los dos ven los dos puntos. En el editor de nacatamalon, el
botón **Online** juega el juego con su servidor (`src/server.ts`) y hasta cuatro jugadores uno al
lado del otro, con una línea lenta para probar.

## Ponerlo en internet

- **El servidor** es un programa que se queda corriendo: cualquier máquina o servicio que corra
  Bun o Node todo el tiempo que quieras (no uno que corre una función por petición y se para).
  `listen` toma el puerto que dé el servicio.
- **`wss://`**: una página servida por `https://` solo puede conectarse a `wss://`. Pon el servidor
  detrás de lo que le dé el certificado a tu sitio (la mayoría de servicios lo hacen por ti, o un
  proxy delante) y conéctate a `wss://tu-dirección`.
- **La página** es el juego publicado como siempre; solo cambia su dirección del servidor.
- **Las cuentas** son tuyas: tu inicio de sesión le da un token a la página, la página lo manda
  con `connect` y `admit` lo comprueba.

## Lo que todavía no hace

Es experimental, y esto se sabe:

- **Los jugadores no siguen un cambio de escena del servidor.** Los objetos que comparte se van
  de sus páginas, pero su escena se queda. De momento, cambia de escena en los dos lados con un
  mensaje.
- **Los stores y las señales son de la página o del proceso, no de la sala.** Todas las salas de un
  servidor los comparten, y en una página con loopback, también el servidor y sus jugadores. Guarda
  el estado de una sala en su escena.
- **Una corrección salta.** Cuando el servidor corrige el objeto propio de un jugador, que es raro,
  va al sitio correcto de golpe en vez de deslizarse.
- **Una pestaña oculta** guarda lo que llega y lo entrega todo al volver: después de mucho rato
  fuera, es mucho de golpe.
- Los mensajes son texto JSON; todavía no hay forma binaria.
