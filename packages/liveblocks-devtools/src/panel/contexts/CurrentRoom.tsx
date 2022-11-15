import type {
  ConnectionState,
  FullClientToPanelMessage,
  StorageTreeNode,
  UserTreeNode,
} from "@liveblocks/core";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { assertNever } from "../../lib/assert";
import type { EventSource, Observable } from "../../lib/EventSource";
import { makeEventSource } from "../../lib/EventSource";
import { onMessageFromClient, sendMessageToClient } from "../port";

type Room = {
  readonly roomId: string;
  status: ConnectionState | null;
  storage: StorageTreeNode[] | null;
  me: UserTreeNode | null;
  others: UserTreeNode[] | null;
};

/**
 * These events are emitted any time a subset of the room data updates.
 */
type EventHub = {
  readonly onStatus: EventSource<void>;
  readonly onMe: EventSource<void>;
  readonly onOthers: EventSource<void>;
  readonly onStorage: EventSource<void>;
};

// XXX Handlers to register notifications for when parts of a room update
const _eventHubs: Map<string, EventHub> = new Map();

function makeEventHub(roomId: string): EventHub {
  const newEventHub: EventHub = {
    onStatus: makeEventSource(),
    onMe: makeEventSource(),
    onOthers: makeEventSource(),
    onStorage: makeEventSource(),
  };
  _eventHubs.set(roomId, newEventHub);
  return newEventHub;
}

function getOrCreateEventHubForRoomId(roomId: string): EventHub {
  return _eventHubs.get(roomId) ?? makeEventHub(roomId);
}

function getRoomHub(roomId: null): null;
function getRoomHub(roomId: string): EventHub;
function getRoomHub(roomId: string | null): EventHub | null {
  return roomId ? getOrCreateEventHubForRoomId(roomId) : null;
}

type SubscribeFn = Observable<void>["subscribe"];

function getSubscribe(
  roomId: string | null,
  eventName: keyof EventHub
): SubscribeFn | undefined {
  if (roomId) {
    const hub = getOrCreateEventHubForRoomId(roomId);
    return hub[eventName].subscribe;
  } else {
    return undefined;
  }
}

// XXX Document purpose of this LUT
const roomsById: Map<string, Room> = new Map();

// XXX Intended to be kept in sync whenever roomsById changes
let allRoomIds: string[] = [];

// XXX Document purpose of this event source
const onRoomCountChanged: EventSource<void> = makeEventSource();

function makeRoom(roomId: string): Room {
  const newRoom = {
    roomId,
    status: null,
    storage: null,
    me: null,
    others: null,
  };

  roomsById.set(roomId, newRoom);
  allRoomIds = Array.from(roomsById.keys());
  onRoomCountChanged.notify();
  return newRoom;
}

function deleteRoom(roomId: string): void {
  if (roomsById.delete(roomId)) {
    allRoomIds = Array.from(roomsById.keys());
    onRoomCountChanged.notify();
  }
}

function getOrCreateRoom(roomId: string): Room {
  return roomsById.get(roomId) ?? makeRoom(roomId);
}

type CurrentRoomContextT = {
  currentRoomId: string | null;
  setCurrentRoomId: (currentRoomId: string | null) => void;
};

const CurrentRoomContext = createContext<CurrentRoomContextT | null>(null);

type Props = {
  children?: ReactNode;
};

export function CurrentRoomProvider(props: Props) {
  const [currentRoomId, _setCurrentRoomId] = useState<string | null>(null);

  /**
   * Can be used by the panel UI to "switch" between currently visible room.
   * This will validate the given room ID and only change the current room ID
   * to a value that is legal, otherwise, this will be a no-op.
   */
  const setCurrentRoomId = useCallback((roomId: string | null): void => {
    if (roomId === null || roomsById.has(roomId)) {
      _setCurrentRoomId(roomId);
    }
  }, []);

  /**
   * Sets the current room ID, but only if there currently isn't a room
   * selected already.
   */
  const softSetCurrentRoomId = useCallback(
    (newRoomId: string | null): void =>
      _setCurrentRoomId((currentRoomId) =>
        currentRoomId === null ||
        (!roomsById.has(currentRoomId) &&
          (newRoomId === null || roomsById.has(newRoomId)))
          ? newRoomId
          : currentRoomId
      ),
    []
  );

  useEffect(() => {
    // Listen for new handshakes/connections!

    function onClientMessage(msg: FullClientToPanelMessage) {
      switch (msg.msg) {
        // A new client just announced itself! Let's connect to it, by sending
        // it the connect message, so it knows it should start broadcasting
        // internal updates to the devtools.
        case "wake-up-devtools": {
          sendMessageToClient({ msg: "connect" });
          break;
        }

        // The client just connected to a room - we don't know anything yet,
        // except the room's ID
        case "room::available": {
          getOrCreateRoom(msg.roomId);
          softSetCurrentRoomId(msg.roomId);
          break;
        }

        // When the client leaves a room, it won't track it any longer, so we
        // can destroy it
        case "room::unavailable": {
          deleteRoom(msg.roomId);
          softSetCurrentRoomId(allRoomIds[0] ?? null);
          break;
        }

        // Storage or presence got updated
        case "room::sync::full":
        case "room::sync::partial": {
          const currRoom = getOrCreateRoom(msg.roomId);

          const hub = getRoomHub(msg.roomId);
          if (msg.status !== undefined) {
            currRoom.status = msg.status;
            hub.onStatus.notify();
          }

          if (msg.storage !== undefined) {
            currRoom.storage = msg.storage;
            hub.onStorage.notify();
          }

          if (msg.me !== undefined) {
            currRoom.me = msg.me;
            hub.onMe.notify();
          }

          if (msg.others !== undefined) {
            currRoom.others = msg.others;
            hub.onOthers.notify();
          }

          _setCurrentRoomId((currentRoomId) => currentRoomId ?? msg.roomId);
          break;
        }

        default: {
          // Ensure that we exhaustively handle all messages
          if (process.env.NODE_ENV === "production") {
            // Ignore these errors in production
          } else {
            // Ensure we exhaustively handle all possible messages
            assertNever(msg, "Unknown message type");
          }
          break;
        }
      }
    }

    onMessageFromClient.addListener(onClientMessage);
    return () => {
      onMessageFromClient.removeListener(onClientMessage);
    };
  }, []);

  // When loading the app, try to connect. This can get acknowledged when an
  // active Liveblocks app is already connected. Or it can not get
  // acknowledged, in which case the dev panel will remain idle until we
  // receive an "wake-up-devtools" message.
  useEffect(() => {
    sendMessageToClient({ msg: "connect" });
  }, []);

  useEffect(() => {
    const roomId = currentRoomId;
    if (!roomId) {
      return;
    }
    sendMessageToClient({ msg: "room::subscribe", roomId });
    return () => {
      sendMessageToClient({ msg: "room::unsubscribe", roomId });
    };
  }, [currentRoomId]);

  // By memoizing this, we ensure that the context won't be updated on every
  // render, just because `value` is a new object every time
  const value = useMemo(
    () => ({ currentRoomId, setCurrentRoomId }),
    [currentRoomId, setCurrentRoomId]
  );

  return (
    <CurrentRoomContext.Provider value={value}>
      {props.children}
    </CurrentRoomContext.Provider>
  );
}

function useCurrentRoomContext(): CurrentRoomContextT {
  const context = useContext(CurrentRoomContext);
  if (context === null) {
    throw new Error(
      "Please use a <CurrentRoomProvider> up the component tree to use useRoomsContext()"
    );
  }
  return context;
}

export function useCurrentRoomId(): string | null {
  return useCurrentRoomContext().currentRoomId;
}

export function getRoom(roomId: string | null): Room | null {
  return roomId ? roomsById.get(roomId) ?? null : null;
}

export function useSetCurrentRoomId(): (roomId: string) => void {
  return useCurrentRoomContext().setCurrentRoomId;
}

// Helper "no-op" subscription
const nosub: SubscribeFn = () => () => {};

export function useRoomIds(): string[] {
  return useSyncExternalStore(
    onRoomCountChanged.subscribe,
    () => allRoomIds,
    () => [] // XXX Do we need to specify these server snapshots, or can we get rid of them everywhere?
  );
}

export function useStatus(): ConnectionState | null {
  const currentRoomId = useCurrentRoomId();
  return useSyncExternalStore(
    getSubscribe(currentRoomId, "onStatus") ?? nosub,
    () => getRoom(currentRoomId)?.status ?? null,
    () => null
  );
}

export function useMe(): UserTreeNode | null {
  const currentRoomId = useCurrentRoomId();
  return useSyncExternalStore(
    getSubscribe(currentRoomId, "onMe") ?? nosub,
    () => getRoom(currentRoomId)?.me ?? null,
    () => null
  );
}

export function useOthers(): UserTreeNode[] | null {
  const currentRoomId = useCurrentRoomId();
  return useSyncExternalStore(
    getSubscribe(currentRoomId, "onOthers") ?? nosub,
    () => {
      const room = getRoom(currentRoomId);
      return room?.others && room.others.length > 0 ? room.others : null;
    },
    () => null
  );
}

export function useStorage(): StorageTreeNode[] | null {
  const currentRoomId = useCurrentRoomId();
  return useSyncExternalStore(
    getSubscribe(currentRoomId, "onStorage") ?? nosub,
    () => getRoom(currentRoomId)?.storage ?? null,
    () => null
  );
}