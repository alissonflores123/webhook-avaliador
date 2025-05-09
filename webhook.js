import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();
const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const GOOGLE_SHEET_ID = process.env.SHEET_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSISTANT_ID = process.env.ASSISTANT_ID;

app.post('/avaliar', async (req, res) => {
  const params = req.body.sessionInfo?.parameters || {};
  const pergunta = params.pergunta || '';
  const resposta = params.Resposta || '';
  const origem = params.texto || '';

  if (!pergunta || !resposta) return res.status(400).send('Dados incompletos');

  try {
    const completion = await axios.post(
      `https://api.openai.com/v1/assistants/${ASSISTANT_ID}/threads`,
      {
        messages: [
          {
            role: 'user',
            content: `Avalie a seguinte resposta de atendimento ao cliente de 1 a 5, onde 1 é péssima e 5 é excelente. Retorne apenas um JSON com as chaves "nota" (número) e "justificativa" (texto).
            
Cliente: ${pergunta}
Atendente: ${resposta}`
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const thread_id = completion.data.id;
    const response = await axios.post(
      `https://api.openai.com/v1/assistants/${ASSISTANT_ID}/threads/${thread_id}/runs`,
      { assistant_id: ASSISTANT_ID },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let status = 'in_progress';
    let output;
    while (status === 'in_progress' || status === 'queued') {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const result = await axios.get(
        `https://api.openai.com/v1/assistants/${ASSISTANT_ID}/threads/${thread_id}/runs/${response.data.id}`,
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      status = result.data.status;
    }

    const messages = await axios.get(
      `https://api.openai.com/v1/assistants/${ASSISTANT_ID}/threads/${thread_id}/messages`,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const respostaIA = messages.data.data[0]?.content[0]?.text?.value;
    console.log('Resposta da IA:', respostaIA);

    const resultado = JSON.parse(respostaIA);
    const nota = parseInt(resultado.nota);
    const justificativa = resultado.justificativa;

    if (nota <= 2) {
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\n/g, '
'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      await sheets.spreadsheets.values.append({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: 'Página1!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[pergunta, resposta, nota, justificativa, origem]],
        },
      });
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Erro ao processar webhook:', err?.response?.data || err.message);
    res.status(500).send('Erro ao processar webhook');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
