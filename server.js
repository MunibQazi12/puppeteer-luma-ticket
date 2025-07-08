const express = require("express");
const puppeteer = require("puppeteer-core");
const chromium = require("chrome-aws-lambda");

const app = express();
app.use(express.json());

app.get("/", async (req, res) => {
  try {
    const browser = await puppeteer.launch({
      executablePath: await chromium.executablePath, // ✅ required
      headless: chromium.headless,
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    await page.goto("https://lu.ma/event/manage/evt-AzSk9qQDzaolFPD/registration", {
      waitUntil: "networkidle2"
    });

    const html = await page.content();
    console.log("🔍 Page HTML (partial):", html.slice(0, 500));
    await browser.close();

    res.send("Health check passed.");
  } catch (err) {
    console.error("Error loading page:", err);
    res.status(500).send(`Error: ${err.message}`);
  }
});

app.post("/create-tickets", async (req, res) => {
  const { eventID } = req.body;

  if (!eventID) return res.status(400).send("Missing eventID");

  try {
    const browser = await puppeteer.launch({
      executablePath: await chromium.executablePath, // ✅ required
      headless: chromium.headless,
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    await page.goto(`https://lu.ma/event/manage/${eventID}/registration`, {
      waitUntil: "networkidle2"
    });

    // TODO: Add ticket interaction logic here

    await browser.close();
    res.send("Tickets created");
  } catch (err) {
    console.error("Ticket creation failed:", err);
    res.status(500).send(`Error: ${err.message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
