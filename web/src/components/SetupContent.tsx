export function SetupContent() {
  return (
    <div className="setup">
      <p>
        Extractive mode still retrieves passages, but a chat model turns them into a written
        answer. Pick either option, then restart the dev server.
      </p>

      <div className="setup-block">
        <h3>OpenAI (or an OpenAI-compatible API)</h3>
        <pre>{`# .env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
# optional: OPENAI_BASE_URL=https://openrouter.ai/api/v1`}</pre>
      </div>

      <div className="setup-block">
        <h3>Fully local with Ollama</h3>
        <pre>{`brew install ollama
ollama serve
ollama pull llama3.2

# .env
OLLAMA_MODEL=llama3.2`}</pre>
      </div>

      <p className="setup-foot">
        <code>LLM_PROVIDER=auto</code> (the default) uses OpenAI when a key is present, then Ollama
        if it is running, and falls back to extractive mode otherwise.
      </p>
    </div>
  );
}
