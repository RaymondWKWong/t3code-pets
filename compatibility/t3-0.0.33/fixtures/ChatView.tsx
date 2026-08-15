function ChatViewContent() {
  const threadError = null;
  const activeLatestTurn = null as null | {
    state: "completed" | "interrupted" | "error";
  };
  const pendingApprovals: unknown[] = [];
  const pendingUserInputs: unknown[] = [];
  const isWorking = false;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
      <span>Chat</span>
    </div>
  );
}

export { ChatViewContent };
