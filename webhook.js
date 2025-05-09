import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';
import { GoogleAuth } from 'google-auth-library';

const app = express();
app.use(bodyParser.json());

const auth = new GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

app.post('/avaliar', async (req, res) => {
  try {
    const pergunta = req.body.sessionInfo?.parameters?.pergunta || 'Sem pergunta';
    const thread_id = req.body.sessionInfo?.parameters?.thread_id;

    const headers = {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    };

    const messages = [
      {
        role: 'user',
        content: `Avalie a pergunta do cliente: "${pergunta}" e classifique com apenas uma palavra como: rastreio, cancelamento, notafiscal, montagem, posvenda, prevena.`
      }
    ];

    const threadResponse = await axios.post('https://api.openai.com/v1/threads', {
      messages: messages
    }, { headers });

    const threadId = threadResponse.data.id;

    const runResponse = await axios.post(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID
    }, { headers });

    const runId = runResponse.data.id;

    let result;
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const check = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, { headers });
      if (check.data.status === 'completed') {
        result = await axios.get(`https://api.openai.com/v1/threads/${threadId}/messages`, { headers });
        break;
      }
    }

    const resposta = result?.data?.data?.[0]?.content?.[0]?.text?.value || 'erro';

    res.json({
      sessionInfo: {
        parameters: {
          resposta_gpt: resposta,
          thread_id: threadId
        }
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro no processamento');
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
