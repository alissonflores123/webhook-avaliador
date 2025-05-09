
const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const axios = require('axios');
const app = express();
app.use(bodyParser.json());

const OPENAI_API_KEY = 'SUA_CHAVE_OPENAI';
const SHEET_ID = 'SUA_ID_PLANILHA';
const SHEET_NAME = 'Avaliação de Atendimentos';

// Autenticador do Google Sheets
const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function appendToSheet(origem, pergunta, resposta, nota, comentario) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:E`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[origem, nota, pergunta, resposta, comentario]],
    },
  });
}

app.post('/avaliar', async (req, res) => {
  try {
    const { pergunta, resposta } = req.body;

    if (!pergunta || !resposta) {
      return res.status(400).json({ error: 'Parâmetros pergunta e resposta obrigatórios' });
    }

    const completion = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Você é um avaliador técnico. Avalie a qualidade da resposta de um atendente para a pergunta de um cliente.
Retorne apenas um JSON no formato:
{
  "nota": número de 1 a 5,
  "comentario": comentário técnico
}
Analise tecnicamente, considerando clareza, empatia e objetividade.`
        },
        {
          role: 'user',
          content: `Pergunta: ${pergunta}
Resposta: ${resposta}`
        }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      }
    });

    const resultado = completion.data.choices[0].message.content.trim();
    const parsed = JSON.parse(resultado);

    await appendToSheet('Dialogflow', pergunta, resposta, parsed.nota, parsed.comentario);
    res.status(200).json({ nota: parsed.nota, comentario: parsed.comentario });
  } catch (err) {
    console.error('Erro no webhook:', err.response?.data || err.message);
    res.status(500).json({ error: 'Erro ao processar avaliação' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
