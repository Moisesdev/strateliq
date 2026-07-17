import os
import asyncio
from openai import AsyncOpenAI

class UserMessage:
    def __init__(self, text: str):
        self.text = text

class TextDelta:
    def __init__(self, content: str):
        self.content = content

class StreamDone:
    pass

class LlmChat:
    def __init__(self, api_key: str = None, session_id: str = None, system_message: str = None):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.session_id = session_id
        self.system_message = system_message
        self.provider = "openai"
        self.model = "gpt-4o-mini"

    def with_model(self, provider: str, model: str):
        self.provider = provider
        self.model = model
        return self

    async def stream_message(self, message: UserMessage):
        if not self.api_key:
            mock_response = f"[Mock LLM Response ({self.provider}/{self.model})]: Hola! Esta es una respuesta simulada porque no tenés configurada la API_KEY en tu .env. Para usar respuestas reales, configurá una API key válida."
            for word in mock_response.split(" "):
                yield TextDelta(content=word + " ")
                await asyncio.sleep(0.05)
            yield StreamDone()
            return

        try:
            client = AsyncOpenAI(api_key=self.api_key)
            messages = []
            if self.system_message:
                messages.append({"role": "system", "content": self.system_message})
            messages.append({"role": "user", "content": message.text})

            response = await client.chat.completions.create(
                model=self.model if self.provider == "openai" else "gpt-4o-mini",
                messages=messages,
                stream=True
            )
            async for chunk in response:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield TextDelta(content=delta)
            yield StreamDone()
        except Exception as e:
            yield TextDelta(content=f"\n[Error en LLM real]: {str(e)}\n")
            yield StreamDone()
