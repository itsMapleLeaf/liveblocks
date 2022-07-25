import { BlockNode, BlockNodeType } from "../types";
import convertNodeChildrenToBlockNode from "./convertNodeChildrenToBlockNode";

const convertNodeToBlockNode = (node: Node): BlockNode => {
  switch (node.nodeName) {
    case "B":
      return {
        type: BlockNodeType.Bold,
        children: convertNodeChildrenToBlockNode(node),
      };
    case "I":
      return {
        type: BlockNodeType.Italic,
        children: convertNodeChildrenToBlockNode(node),
      };
    case "S":
      return {
        type: BlockNodeType.Strikethrough,
        children: convertNodeChildrenToBlockNode(node),
      };
    case "U":
      return {
        type: BlockNodeType.Underline,
        children: convertNodeChildrenToBlockNode(node),
      };
    default:
    case "#text":
      return {
        type: BlockNodeType.Text,
        text: node.textContent || "",
      };
  }
};

export default convertNodeToBlockNode;