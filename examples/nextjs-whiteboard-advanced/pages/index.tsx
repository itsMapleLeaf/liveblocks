import React from "react";
import Whiteboard from "../src";

export default function Home() {
  const [mounted, setMounted] = React.useState(true);
  return (
    <main>
      <div className="p-3 text-center">
        <button
          className="rounded bg-indigo-700 px-5 py-2 text-white"
          onClick={() => setMounted((x) => !x)}
        >
          {mounted ? "Unmount" : "Re-mount"}
        </button>
      </div>
      {mounted ? <Whiteboard /> : null}
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
