/**
 * Compatibility layer for ElizaOS 1.7.x API changes
 */

import { IAgentRuntime } from "@elizaos/core";

export async function generateText(params: {
  runtime: IAgentRuntime;
  context: string;
  modelClass?: string;
}): Promise<string> {
  const { runtime, context } = params;
  
  try {
    const result = await runtime.generateText(context);
    return result.text || result.toString();
  } catch (error) {
    return "";
  }
}

export const ModelClass = {
  SMALL: "small",
  MEDIUM: "medium",
  LARGE: "large",
  EMBEDDING: "embedding",
};
