declare module "hast-util-to-string" {
  import { Node } from "unist";

  const hastToString: (node: Node) => string;

  export default hastToString;
}
