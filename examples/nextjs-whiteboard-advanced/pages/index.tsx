import React from "react";
import Whiteboard from "../src";

export default function Home() {
  const [mounted1, setMounted1] = React.useState(true);
  const [mounted2, setMounted2] = React.useState(false);
  return (
    <main>
      <div className="space-x-5 p-3 text-center">
        <button
          className="rounded bg-indigo-700 px-5 py-2 text-white"
          onClick={() => setMounted1((x) => !x)}
        >
          {mounted1 ? "Unmount" : "Mount"} room <strong>Foo</strong>
        </button>
        <button
          className="rounded bg-indigo-700 px-5 py-2 text-white"
          onClick={() => setMounted2((x) => !x)}
        >
          {mounted2 ? "Unmount" : "Mount"} room <strong>Bar</strong>
        </button>
      </div>
      <div className="flex min-h-screen space-x-5">
        <div className="flex-1">
          {mounted1 ? <Whiteboard roomId="room-foo" /> : null}
        </div>
        <div className="flex-1">
          {mounted2 ? <Whiteboard roomId="room-bar" /> : null}
        </div>
      </div>
    </main>
  );
}

export async function getStaticProps() {
  const API_KEY = process.env.LIVEBLOCKS_SECRET_KEY;
  const API_KEY_WARNING = process.env.CODESANDBOX_SSE
    ? `Add your secret key from https://liveblocks.io/dashboard/apikeys as the \`LIVEBLOCKS_SECRET_KEY\` secret in CodeSandbox.\n` +
      `Learn more: https://github.com/liveblocks/liveblocks/tree/main/examples/nextjs-whiteboard#codesandbox.`
    : `Create an \`.env.local\` file and add your secret key from https://liveblocks.io/dashboard/apikeys as the \`LIVEBLOCKS_SECRET_KEY\` environment variable.\n` +
      `Learn more: https://github.com/liveblocks/liveblocks/tree/main/examples/nextjs-whiteboard#getting-started.`;

  if (!API_KEY) {
    console.warn(API_KEY_WARNING);
  }

  return { props: {} };
}
