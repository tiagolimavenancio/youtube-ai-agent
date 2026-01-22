import { Button } from "@/components/ui/button";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { NavigationContext } from "@/lib/NavigationProvider";
import { TrashIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { use } from "react";

interface ChatRowProps {
  chat: Doc<"chats">;
  onDelete: (id: Id<"chats">) => void;
}

function ChatRow({ chat, onDelete }: ChatRowProps) {
  const router = useRouter();
  const { closeMobileNav } = use(NavigationContext);

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
          {chat.title}
          <Button
            variant={"ghost"}
            size={"icon"}
            className="opacity-0 group-hover:opacity-100 -mr-2 ml-2  transition-opacity duration-200"
            onClick={(e) => handleDelete(e, chat._id)}
          >
            <TrashIcon className="size-4 text-gray-400 hover:text-red-500 transition-colors duration-300" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ChatRow;
