import type {
  ChatProvider,
  ChatRequest,
  ChatResponse,
  DecisionProvider,
  DecisionRequest,
  DecisionResponse,
} from "../types.js";

export function createMockChatProvider(script: readonly ChatResponse[]): ChatProvider {
  const next = scripted(script);
  return {
    async complete(_request: ChatRequest): Promise<ChatResponse> {
      return next();
    },
  };
}

export function createMockDecisionProvider(script: readonly DecisionResponse[]): DecisionProvider {
  const next = scripted(script);
  return {
    async decide(_request: DecisionRequest): Promise<DecisionResponse> {
      return next();
    },
  };
}

function scripted<T>(script: readonly T[]): () => Promise<T> {
  let index = 0;
  return async () => {
    const response = script[index];
    if (response === undefined) throw new Error("mock provider script exhausted");
    index += 1;
    return structuredClone(response);
  };
}
