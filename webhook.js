
const express = require('express');
const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const app = express();
app.use(express.json());

app.post('/avaliar', async (req, res) => {
  try {
    const pergunta = req.body.pergunta;
    const resposta = req.body.resposta;
    const paginaOrigem = req.body.pagina_origem;

    // Cria uma nova thread
    const thread = await axios.post(
      'https://api.openai.com/v1/threads',
      {},
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const thread_id = thread.data.id;

    // Envia mensagem para a thread do Assistant
    await axios.post(
      `https://api.openai.com/v1/threads/${thread_id}/messages`,
      {
        role: 'user',
        content: `Cliente: ${pergunta}\nAtendente: ${resposta}`
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Roda o Assistant na thread
    const run = await axios.post(
      `https://api.openai.com/v1/threads/${thread_id}/runs`,
      {
        assistant_id: process.env.ASSISTANT_ID
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Aguarda conclusão
    let status = 'in_progress';
    let result;
    while (status === 'in_progress') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const runStatus = await axios.get(
        `https://api.openai.com/v1/threads/${thread_id}/runs/${run.data.id}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
          }
        }
      );
      status = runStatus.data.status;
    }

    // Busca mensagens finais
    const messages = await axios.get(
      `https://api.openai.com/v1/threads/${thread_id}/messages`,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );

    const ultima = messages.data.data.find(m => m.role === 'assistant');
    const jsonMatch = ultima.content[0].text.value.match(/\{.*\}/s);
    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.nota <= 2) {
      const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
      doc.useApiKey(process.env.GOOGLE_SHEETS_API_KEY);
      await doc.loadInfo();
      const sheet = doc.sheetsByIndex[0];
      await sheet.addRow({
        Origem: paginaOrigem,
        Nota: parsed.nota,
        Pergunta: pergunta,
        Resposta: resposta,
        Comentario: parsed.comentario
      });
    }

    res.json({ status: 'Avaliação registrada', nota: parsed.nota });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro na avaliação' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
