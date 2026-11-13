const test = require("node:test");
const assert = require("node:assert/strict");
const ChatbotService = require("../lib/chatbot");

test("pertanyaan lanjutan memakai konteks produk dari riwayat", async () => {
  const calls = [];
  const groq = {
    chat: {
      completions: {
        create: async (payload) => {
          calls.push(payload);
          return {
            choices: [{ message: { content: "Jawaban uji" } }],
            response: { headers: { get: () => null } }
          };
        }
      }
    }
  };
  const chatbot = new ChatbotService({ groq });
  await chatbot.replyFor("history-test", "berapa harga acc flair?");
  await chatbot.replyFor("history-test", "berapa harganya?");

  assert.equal(calls.length, 2);
  assert.match(calls[1].messages[0].content, /Acc - Flair/i);
  assert.match(calls[1].messages[0].content, /shopee\.co\.id/i);
});
