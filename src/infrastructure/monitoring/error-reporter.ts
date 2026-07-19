interface SafeErrorDetails {
  name: string;
  message: string;
}

function sanitizeError(error: unknown): SafeErrorDetails {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: "Operation failed.",
    };
  }

  return {
    name: "UnknownError",
    message: "Operation failed.",
  };
}

export function reportError(context: string, error: unknown): void {
  console.error(`[VimForge] ${context}`, sanitizeError(error));
}
