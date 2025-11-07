import express from "express";

import { protectedUser } from "../middleware/common/protectedUser.js";
import { getMessages } from "../controllers/chat.controller.js";
import { sendMessage } from "../controllers/chat.controller.js";
import { getConversations } from "../controllers/chat.controller.js";
import { clearChatHistory } from "../controllers/chat.controller.js";
import { getOnlineUsers } from "../controllers/chat.controller.js";
import { getAllConversations } from "../controllers/chat.controller.js";

const router = express.Router();

// Send a message
router.post("/send", protectedUser, sendMessage);
// get all messages
router.get("/messages/:id", protectedUser, getMessages);
// get all conversations
router.get("/conversations/:id", protectedUser, getConversations);
// clear chat history for current user only
router.delete("/clear/:id", protectedUser, clearChatHistory);
// get online users
router.get("/online-users", protectedUser, getOnlineUsers);
// get all conversations for the logged-in user
router.get("/conversations", protectedUser, getAllConversations);

export default router;