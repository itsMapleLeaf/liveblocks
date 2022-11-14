import type {
  ConnectionState,
  FullClientToPanelMessage,
  StorageTreeNode,
  UserTreeNode,
} from "@liveblocks/core";
import { assertNever } from "@liveblocks/core";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { onMessageFromClient, sendMessageToClient } from "../port";

type RoomMirror = {
  readonly roomId: string;
  readonly status?: ConnectionState;
  readonly storage?: StorageTreeNode[];
  readonly me?: UserTreeNode;
  readonly others?: UserTreeNode[];

  // onMessage
  // sendMessage
};

type InternalRoomsContext = {
  readonly currentRoomId: string | null;
  readonly allRooms: ReadonlyMap</* roomId */ string, RoomMirror>;
};

type RoomsContext = InternalRoomsContext & {
  setCurrentRoomId: (currentRoomId: string | null) => void;
};

const RoomMirrorContext = createContext<RoomsContext | null>(null);

type Props = {
  children?: ReactNode;
};

export function RoomMirrorProvider(props: Props) {
  const [ctx, setCtx] = useState<InternalRoomsContext>(() => ({
    currentRoomId: null,
    allRooms: new Map(),
  }));

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
          // sendMessageToClient({ msg: "room::subscribe", roomId: msg.roomId });
          setCtx((ctx) => {
            const allRooms = new Map(ctx.allRooms);
            allRooms.set(msg.roomId, { roomId: msg.roomId });

            // If the current room is the one that's disappearing, switch to
            // a random other room if one is available
            let currentRoomId = ctx.currentRoomId;
            if (!allRooms.has(currentRoomId)) {
              currentRoomId = msg.roomId;
            }

            return { currentRoomId, allRooms };
          });
          break;
        }

        // When the client leaves a room, it won't track it any longer, so we
        // can destroy it
        case "room::unavailable": {
          setCtx((ctx) => {
            const allRooms = new Map(ctx.allRooms);
            allRooms.delete(msg.roomId);

            // If the current room is the one that's disappearing, switch to
            // a random other room if one is available
            let currentRoomId = ctx.currentRoomId;
            if (!allRooms.has(currentRoomId)) {
              currentRoomId = allRooms.keys().next().value ?? null;
            }

            return { currentRoomId, allRooms };
          });
          break;
        }

        // Storage or presence got updated
        case "room::sync::full":
        case "room::sync::partial": {
          setCtx((ctx) => {
            const currRoom = ctx.allRooms.get(msg.roomId) ?? ({} as RoomMirror);
            const allRooms = new Map(ctx.allRooms);
            allRooms.set(msg.roomId, {
              ...currRoom,
              roomId: msg.roomId,
              status: msg.status ?? currRoom.status,
              storage: msg.storage ?? currRoom.storage,
              me: msg.me ?? currRoom.me,
              others: msg.others ?? currRoom.others,
            });
            return {
              currentRoomId: ctx.currentRoomId ?? msg.roomId,
              allRooms,
            };
          });
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

  /**
   * Can be used by the panel UI to "switch" between currently visible room.
   */
  const setCurrentRoomId = useCallback(
    (roomId: string | null): void => {
      if (roomId === null || ctx.allRooms.has(roomId)) {
        setCtx((ctx) => ({ ...ctx, currentRoomId: roomId }));
      }
    },
    [ctx.currentRoomId, ctx.allRooms]
  );

  useEffect(() => {
    sendMessageToClient({ msg: "room::subscribe", roomId: ctx.currentRoomId });

    return () => {
      sendMessageToClient({
        msg: "room::unsubscribe",
        roomId: ctx.currentRoomId,
      });
    };
  }, [ctx.currentRoomId]);

  const value = useMemo(
    () => ({ ...ctx, setCurrentRoomId }),
    [ctx, setCurrentRoomId]
  );

  return (
    <RoomMirrorContext.Provider value={value}>
      {props.children}
    </RoomMirrorContext.Provider>
  );
}

export function useRoomsContext(): RoomsContext {
  const ctx = useContext(RoomMirrorContext);
  if (ctx === null) {
    throw new Error(
      "Please use a <RoomMirrorProvider> up the component tree to use useRoomsContext()"
    );
  }
  return ctx;
}

export function useCurrentRoomOrNull(): RoomMirror | null {
  const ctx = useRoomsContext();
  if (ctx.currentRoomId === null) {
    return null;
  } else {
    return ctx.allRooms.get(ctx.currentRoomId);
  }
}

export function useCurrentRoom(): RoomMirror {
  const room = useCurrentRoomOrNull();
  if (room === null) {
    throw new Error("Please select a room to view first");
  }
  return room;
}