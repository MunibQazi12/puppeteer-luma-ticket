const express = require("express");
const chromium = require("chrome-aws-lambda");
const puppeteer = require("puppeteer-core");

const app = express();
app.use(express.json());

// ✅ Health check route
app.get("/", async (req, res) => {
  try {
    const browser = await puppeteer.launch({
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    await page.goto(
      `https://lu.ma/event/manage/evt-AzSk9qQDzaolFPD/registration`,
      { waitUntil: "networkidle2" }
    );

    const html = await page.content();
    console.log("🔍 Page HTML (partial):", html.slice(0, 1000));

    await browser.close();
    res.send("Health check passed. Page loaded.");
  } catch (err) {
    console.error("Error loading page:", err);
    res.status(500).send(`Error: ${err.message}`);
  }
});

// ✅ Ticket creation endpoint
app.post("/create-tickets", async (req, res) => {
  const { eventID } = req.body;

  if (!eventID) {
    return res.status(400).send("Missing eventID");
  }

  try {
    const browser = await puppeteer.launch({
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    await page.goto(`https://lu.ma/event/manage/${eventID}/registration`, {
      waitUntil: "networkidle2"
    });

    // ✅ Insert form-filling logic here

    await browser.close();
    res.send("Tickets created");
  } catch (err) {
    console.error("Ticket creation failed:", err);
    res.status(500).send(`Error: ${err.message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
