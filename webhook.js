import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post('/avaliar', async (req, res) => {
  try {
    const { pergunta, Resposta } = req.body.sessionInfo.parameters;

    const prompt = `Avalie tecnicamente a resposta enviada ao cliente com base na pergunta e gere uma nota de 1 a 5, seguida de um comentário explicativo e técnico. Responda sempre no seguinte formato JSON:
{
  "Origem": "Dialogflow",
  "Nota": <número de 1 a 5>,
  "Pergunta": "<a pergunta original>",
  "Resposta": "<a resposta original>",
  "Comentario": "<comentário técnico explicando a nota>"
}

Pergunta: "${pergunta}"
Resposta: "${Resposta}"`;

    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const respostaTextual = openaiResponse.data.choices[0].message.content;
    const respostaJson = JSON.parse(respostaTextual);

    res.json({
      sessionInfo: {
        parameters: respostaJson
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao processar avaliação.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});