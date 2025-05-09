
const express = require("express");
const bodyParser = require("body-parser");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const SHEET_ID = "1eD0AU6OYHclOLfQMGmlD0M6w8_YPyT0DspgFjkJ3rTc"; // ID da planilha "Avaliação de Atendimentos"
const SHEET_TAB_NAME = "Página1";
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");

const PROMPT = (pergunta, resposta) => `
Você é um avaliador técnico de atendimentos ao cliente.

Avalie a seguinte interação com nota de 1 a 5 (onde 1 é muito ruim e 5 é excelente), considerando clareza, empatia e adequação da resposta à pergunta feita.

Formato da saída: JSON com as chaves "nota" (número de 1 a 5) e "comentario" (frase curta explicando o motivo da nota).

Pergunta do cliente: "${pergunta}"
Resposta do atendente: "${resposta}"
`;

app.post("/avaliar", async (req, res) => {
  try {
    const { pergunta, Resposta } = req.body.sessionInfo.parameters;
    if (!pergunta || !Resposta) {
      return res.status(400).send("Parâmetros ausentes.");
    }

    const completion = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages: [
          {
            role: "user",
            content: PROMPT(pergunta, Resposta),
          },
        ],
        temperature: 0,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const resposta = completion.data.choices[0].message.content.trim();
    const json = JSON.parse(resposta);

    // Enviar para Google Sheets
    const doc = new GoogleSpreadsheet(SHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: SERVICE_ACCOUNT_EMAIL,
      private_key: PRIVATE_KEY,
    });
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[SHEET_TAB_NAME];

    await sheet.addRow({
      Origem: "Dialogflow CX",
      Nota: json.nota,
      Pergunta: pergunta,
      Resposta: Resposta,
      Comentario: json.comentario,
    });

    res.json({
      fulfillment_response: {
        messages: [
          {
            text: {
              text: ["Avaliação registrada com sucesso."],
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error("Erro:", error.message);
    res.status(500).send("Erro interno no webhook.");
  }
});

app.listen(10000, () => {
  console.log("Servidor rodando na porta 10000");
});
