const express = require('express');
const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 10000;

const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const ASSISTANT_ID = process.env.ASSISTANT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post('/avaliar', async (req, res) => {
  try {
    const { pergunta, resposta, pagina_origem, thread_id } = req.body;

    let thread = thread_id;
    if (!thread) {
      const created = await axios.post("https://api.openai.com/v1/threads", {
        messages: []
      }, {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      thread = created.data.id;
    }

    await axios.post(`https://api.openai.com/v1/threads/${thread}/messages`, {
      role: "user",
      content: `Avalie de 1 a 5 a seguinte resposta que o bot deu ao cliente.

Cliente: ${pergunta}
Bot: ${resposta}

Responda apenas no formato JSON: {"nota": X, "justificativa": "texto explicando a nota"}`,
    }, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const run = await axios.post(`https://api.openai.com/v1/threads/${thread}/runs`, {
      assistant_id: ASSISTANT_ID
    }, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    let status = "queued";
    let ultima = null;
    while (status !== "completed") {
      const check = await axios.get(`https://api.openai.com/v1/threads/${thread}/runs/${run.data.id}`, {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`
        }
      });
      status = check.data.status;
      await new Promise(r => setTimeout(r, 1000));
    }

    const mensagens = await axios.get(`https://api.openai.com/v1/threads/${thread}/messages`, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      }
    });

    for (const msg of mensagens.data.data) {
      if (msg.role === "assistant") {
        ultima = msg;
        break;
      }
    }

    let parsed = null;
    try {
      const jsonMatch = ultima.content[0].text.value.match(/\{.*\}/s);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Erro ao parsear JSON:", e.message);
    }

    if (parsed && parsed.nota <= 2) {
      const doc = new GoogleSpreadsheet(SHEET_ID);
      await doc.useApiKey(GOOGLE_SHEETS_API_KEY);
      await doc.loadInfo();
      const sheet = doc.sheetsByIndex[0];
      await sheet.addRow({
        pergunta,
        resposta,
        nota: parsed.nota,
        justificativa: parsed.justificativa,
        origem: pagina_origem
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao processar a avaliação');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});