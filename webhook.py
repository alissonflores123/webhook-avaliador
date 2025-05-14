import os
import openai
import time
import traceback
import re
from flask import Flask, request, jsonify

app = Flask(__name__)

openai.api_key = os.getenv("OPENAI_API_KEY")
ASSISTANT_ID = os.getenv("ASSISTANT_ID")

@app.route("/webhook", methods=["POST"])
def webhook():
    try:
        data = request.get_json()
        user_input = data.get("text", "")
        session_params = data.get("sessionInfo", {}).get("parameters", {})
        thread_id = session_params.get("thread_id")
        ASSISTANT_ID = session_params.get("assistant_id")

        # Validar se o thread_id tem formato correto
        valid_id = lambda x: isinstance(x, str) and re.match(r"^[\w-]+$", x)
        if not valid_id(thread_id):
            thread = openai.beta.threads.create()
            thread_id = thread.id 

        # Adicionar os parâmetros do Dialogflow no início da mensagem do usuário
        if session_params:
            contexto = "\n".join([f"{k}: {v}" for k, v in session_params.items() if (k != "thread_id" and k != "assistant_id")])
            mensagem_final = f"Contexto fornecido pelo sistema:\n{contexto}\n\nMensagem do cliente:\n{user_input}"
        else:
            mensagem_final = user_input

        # Enviar a mensagem consolidada
        openai.beta.threads.messages.create(
            thread_id=thread_id,
            role="user",
            content=mensagem_final
        )

        # Executar assistant
        run = openai.beta.threads.runs.create(
            thread_id=thread_id,
            assistant_id=ASSISTANT_ID
        )

        while True:
            run_status = openai.beta.threads.runs.retrieve(
                thread_id=thread_id,
                run_id=run.id
            )
            if run_status.status == "completed":
                break
            elif run_status.status in ["failed", "cancelled", "expired"]:
                raise Exception(f"Run falhou: {run_status.status}")
            time.sleep(0.5)

        messages = openai.beta.threads.messages.list(thread_id=thread_id)
        response_text = messages.data[0].content[0].text.value if messages.data else "Desculpe, não entendi."

        # Validar se o retorno do chatGPT é apenas uma palavra
        if (' ' not in response_text):
            return jsonify({
                "fulfillment_response": {
                    "messages": [{
                        "text": {
                            "text": ''
                        }
                    }]
                },
                "session_info": {
                    "parameters": {
                        "thread_id": thread_id,
                        "resposta_gpt": [response_text]
                    }
                }
            })
        else:
            return jsonify({
                "fulfillment_response": {
                    "messages": [{
                        "text": {
                            "text": [response_text]
                        }
                    }]
                },
                "session_info": {
                    "parameters": {
                        "thread_id": thread_id,
                        "resposta_gpt": [response_text]
                    }
                }
            })

    except Exception as e:
        print("Erro:", str(e))
        traceback.print_exc()
        return jsonify({
            "fulfillment_response": {
                "messages": [{
                    "text": {
                        "text": ["Erro interno no webhook."]
                    }
                }]
            }
        }), 500

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)