import React, { use } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { NavigationContext } from "@/lib/NavigationProvider";
import { useQuery } from "convex/react";
import { TrashIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import TimeAgo from "react-timeago";

interface ChatRowProps {
  chat: Doc<"chats">;
  onDelete: (id: Id<"chats">) => void;
}

function ChatRow({ chat, onDelete }: ChatRowProps) {
  const router = useRouter();
  const { closeMobileNav } = use(NavigationContext);
  const lastMessage = useQuery(api.messages.getLastMessage, { chatId: chat._id });

  const handleClick = () => {
    router.push(`/dashboard/chat/${chat._id}`);
    closeMobileNav();
  };

  const handleDelete = (e: React.MouseEvent<HTMLButtonElement>, id: Id<"chats">) => {
    e.stopPropagation();
    onDelete(id);
  };

  return (
    <div
      className="group rounded-xl border border-gray-200/30 bg-white/50 backdrop-blur-xs hover:bg-white/80 transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md"
      onClick={handleClick}
    >
      <div className="p-4">
        <div className="flex justify-between items-start">
          <p className="text-sm text-gray-600 truncate flex-1 font-medium">
            {lastMessage ? (
              <>
                {lastMessage?.role === "user" ? "You: " : "AI: "}
                {lastMessage?.content.replace(/\\n/g, "\n")}
              </>
            ) : (
              <span className="text-gray-400">New Conversation</span>
            )}
          </p>
          <Button
            variant={"ghost"}
            size={"icon"}
            className="opacity-0 group-hover:opacity-100 -mr-2 ml-2  transition-opacity duration-200"
            onClick={(e) => handleDelete(e, chat._id)}
          >
            <TrashIcon className="size-4 text-gray-400 hover:text-red-500 transition-colors duration-300" />
          </Button>
        </div>

        {/** Last Message */}
        {lastMessage && (
          <p className="text-xs text-gray-400 mt-1.5 font-medium">
            <TimeAgo date={lastMessage.createdAt} />
          </p>
        )}
      </div>
    </div>
  );
}

export default ChatRow;
