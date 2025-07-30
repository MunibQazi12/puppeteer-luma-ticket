require("dotenv").config();
const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());

async function launchBrowser() {
  return await puppeteer.launch({
    headless: true,
    // executablePath: '/usr/bin/chromium-browser',
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
}

// Helper: Convert UTC ISO date string to PDT date object and 12-hour time string (e.g. "07:00 AM")
function convertUTCToPDT(dateStr) {
  const date = new Date(dateStr);
  const offsetMillis = 7 * 60 * 60 * 1000; // PDT is UTC-7 during daylight saving
  const pdtDate = new Date(date.getTime() - offsetMillis);

  let hours = pdtDate.getHours();
  const minutes = pdtDate.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return {
    dateObj: pdtDate,
    timeString: `${hours.toString().padStart(2, "0")}:${minutes} ${ampm}`,
    year: pdtDate.getFullYear(),
    month: pdtDate.getMonth() + 1,
    day: pdtDate.getDate(),
  };
}

async function clickDate(page, dateStr) {
  // dateStr format: ISO string (e.g., "2025-08-06T00:00:00.000Z" PDT adjusted)
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-based
  const day = date.getDate();

  const monthKey = `${year}-${month}`;
  const dayStr = String(day);

  await page.waitForSelector(`[data-lux-date-picker-month="${monthKey}"]`, { visible: true, timeout: 10000 });

  await page.evaluate((monthKey) => {
    const monthBlock = document.querySelector(`[data-lux-date-picker-month="${monthKey}"]`);
    if (monthBlock) monthBlock.scrollIntoView({ block: "center" });
  }, monthKey);

  const clicked = await page.evaluate((monthKey, dayStr) => {
    const monthBlock = document.querySelector(`[data-lux-date-picker-month="${monthKey}"]`);
    if (!monthBlock) return false;
    const days = [...monthBlock.querySelectorAll('div.day')];
    const dayToClick = days.find(d => d.textContent.trim() === dayStr);
    if (dayToClick) {
      dayToClick.click();
      return true;
    }
    return false;
  }, monthKey, dayStr);

  if (!clicked) throw new Error(`Date ${dayStr} in month ${monthKey} not found in calendar`);
}

async function clickTime(page, dateStr) {
  const date = new Date(dateStr);

  // Convert to 12-hour format with AM/PM, e.g. "07:00 AM"
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12; // convert 0 to 12 for 12 AM
  const timeToClick = `${hours.toString().padStart(2, "0")}:${minutes} ${ampm}`;

  // Wait for any visible time dropdown container to appear
  await page.waitForFunction(() => {
    const menus = [...document.querySelectorAll(".lux-menu-wrapper")];
    return menus.some(menu => menu.offsetParent !== null);
  }, { timeout: 10000 });

  // Find the visible dropdown menu and click the matching time option
  const timeClicked = await page.evaluate((timeToClick) => {
    const menus = [...document.querySelectorAll(".lux-menu-wrapper")];
    // Find the first visible menu
    const visibleMenu = menus.find(menu => menu.offsetParent !== null);
    if (!visibleMenu) return false;

    const items = [...visibleMenu.querySelectorAll(".jsx-163bcec685fd7e8e.item")];
    const matching = items.find(item => item.textContent.trim() === timeToClick);
    if (matching) {
      matching.click();
      return true;
    }
    return false;
  }, timeToClick);

  if (!timeClicked) {
    throw new Error(`Time "${timeToClick}" not found in time picker`);
  }
}


async function createTicket(page, steps, name, description, purchaseDeadline, pricingPerSeat) {
  steps.push(`Opening modal to create: ${name}`);

  await page.waitForSelector('input[name="name"]', { hidden: true, timeout: 15000 });
  await page.waitForSelector("button .label", { timeout: 20000 });

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b =>
      b.innerText.includes("New Ticket Type")
    );
    if (btn) btn.click();
  });

  await page.waitForFunction(() => {
    const input = document.querySelector('input[name="name"]');
    return input && !input.disabled && !input.readOnly && input.offsetParent !== null;
  }, { timeout: 10000 });

  await new Promise(res => setTimeout(res, 300));

  steps.push(`Typing Ticket Name: ${name}`);

  await page.waitForSelector('input[name="name"]', { visible: true, timeout: 10000 });

  await page.evaluate((value) => {
    const input = document.querySelector('input[name="name"]');
    if (!input) return;

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    nativeInputValueSetter?.call(input, value);

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, name);

  steps.push("Clicking Add Description");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b =>
      b.innerText.includes("Add Description")
    );
    if (btn) btn.click();
  });

  steps.push("Typing description");
  await page.waitForSelector("textarea", { timeout: 5000 });
  await page.focus("textarea");
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type("textarea", description, { delay: 40 });

  steps.push("Enabling approval toggle");
  await page.evaluate(() => {
    const toggle = document.querySelector("#require-approval-toggle");
    if (toggle && !toggle.checked) toggle.click();
  });

  steps.push("Clicking Limits & Restrictions");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("div[role='button']")].find(b =>
      b.innerText.includes("Limits") && b.innerText.includes("Sales")
    );
    if (btn) btn.click();
  });

  steps.push("Filling capacity");
  await page.waitForSelector('input[name="max_capacity"]', { timeout: 10000 });
  await page.click('input[name="max_capacity"]', { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type('input[name="max_capacity"]', name.includes("Early") ? "3" : "5");

  steps.push("Enabling sales end toggle");
  await page.evaluate(() => {
    const toggle = document.querySelector("#valid-end-toggle");
    if (toggle && !toggle.checked) toggle.click();
  });

  if (purchaseDeadline) {
    steps.push("Filling sales end date & time");

    // Convert UTC purchaseDeadline to PDT date and time
    const { dateObj, timeString } = convertUTCToPDT(purchaseDeadline);

    // Open calendar popup by clicking date input
    await page.evaluate(() => {
      const parent = document.querySelector('.jsx-90b448f30dd66b00.flex-column');
      if (!parent) {
        console.warn('Parent container not found');
        return;
      }

      const children = [...parent.children];
      if (children.length < 5) {
        console.warn('Less than 5 children found');
        return;
      }

      const fifthChild = children[4];
      if (!fifthChild) {
        console.warn('5th child not found');
        return;
      }

      const wrapperDiv = fifthChild.querySelector('div.lux-menu-trigger-wrapper.cursor-pointer');
      if (!wrapperDiv) {
        console.warn('Date input wrapper div not found');
        return;
      }

      const dateInput = wrapperDiv.querySelector('input[type="text"]');
      if (!dateInput) {
        console.warn('Date text input not found');
        return;
      }

      dateInput.click();
    });

    await new Promise(res => setTimeout(res, 300));

    await clickDate(page, dateObj.toISOString());

    await new Promise(res => setTimeout(res, 300));

    // Click time input to open time dropdown
    const timeInputSelector = '.jsx-90b448f30dd66b00.flex-column > :nth-child(5) div.datetime-input > div.time-input input[type="time"]';
    await page.waitForSelector(timeInputSelector, { visible: true, timeout: 10000 });
    await page.click(timeInputSelector);

    await new Promise(res => setTimeout(res, 300));

    await clickTime(page, dateObj.toISOString());
  }

  // Rest of your createTicket function unchanged...

  await new Promise(r => setTimeout(r, 1000));

  steps.push("Clicking Back from modal");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b =>
      b.getAttribute("aria-label") === "Back"
    );
    if (btn) btn.click();
  });

  await new Promise(r => setTimeout(r, 1000));

  steps.push("Clicking Paid ticket type");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b =>
      b.innerText.trim() === "Paid"
    );
    if (btn) btn.click();
  });

  await new Promise(r => setTimeout(r, 1000));

  if (pricingPerSeat !== undefined && pricingPerSeat !== null) {
    steps.push("Typing ticket price");

    const price = name.includes("Early")
      ? (pricingPerSeat * 0.85).toFixed(2)
      : pricingPerSeat.toFixed(2);

    await page.waitForSelector('input[type="text"].monospace', { visible: true, timeout: 10000 });

    await page.evaluate((priceVal) => {
      const input = document.querySelector('input[type="text"].monospace');
      if (!input) return;

      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeInputValueSetter?.call(input, priceVal);

      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, price);
  }

  steps.push("Submitting ticket form");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b =>
      b.innerText.includes("Create Ticket Type")
    );
    if (btn) btn.click();
  });

  steps.push("Waiting for modal to close");
  await new Promise(r => setTimeout(r, 1000));
  await page.waitForSelector('input[name="name"]', { hidden: true, timeout: 20000 });

  steps.push(`✅ Created ticket: ${name}`);
}

async function deleteDefaultTicket(page, steps) {
  steps.push("🔍 Looking for Standard ticket");

  await page.waitForSelector("div.base-list-row.clickable", { visible: true, timeout: 10000 });

  const StandardTicket = await page.evaluate(() => {
    const logs = [];

    const row = document.querySelector("div.base-list-row.clickable");
    if (!row) {
      logs.push("❌ No '.base-list-row.clickable' found.");
      return { clicked: false, logs };
    }

    logs.push("✅ Found ticket row element.");

    const leftGroup = row.querySelector("div.left.min-width-0");
    if (!leftGroup) {
      logs.push("❌ No '.left.min-width-0' group found.");
      return { clicked: false, logs };
    }

    const childDivs = leftGroup.querySelectorAll("div.min-width-0");
    logs.push(`🔍 Found ${childDivs.length} .min-width-0 divs inside left group.`);

    const name = childDivs[0]?.textContent?.trim();
    logs.push(`🧾 Extracted ticket name: "${name}"`);

    if (name === "Standard") {
      row.click();
      logs.push("✅ Ticket name matched 'Standard'. Clicked.");
      return { clicked: true, logs };
    }

    logs.push("⚠️ Ticket name did not match 'Standard'.");
    return { clicked: false, logs };
  });

  for (const log of StandardTicket.logs) {
    steps.push(log);
  }

  steps.push("clicked: " + StandardTicket.clicked);

  if (!StandardTicket.clicked) {
    steps.push("⚠️ No ticket named 'Standard' found to delete");
    return;
  }

  steps.push("🧾 Modal opened");
  await new Promise(resolve => setTimeout(resolve, 2000));

  const threeDotsClick = await page.evaluate(() => {
    const logs = [];

    // Step 1: Find the anchor element
    const iconDiv = document.querySelector('.text-secondary-alpha');

    if (!iconDiv) {
      logs.push("❌ Could not find element with class 'text-secondary-alpha'.");
      return { success: false, logs };
    }

    // Step 2: Traverse up to the shared parent container
    const container = iconDiv.closest('.flex-start.spread.gap-2');
    if (!container) {
      logs.push("❌ Could not find parent container from 'text-secondary-alpha'.");
      return { success: false, logs };
    }

    // Step 3: Find the 'Actions' button within the container
    const targetButton = container.querySelector('button[aria-label="Actions"]');
    if (!targetButton) {
      logs.push("❌ Could not find the 'Actions' button inside the sibling container.");
      return { success: false, logs };
    }

    logs.push("✅ Found the correct 'Actions' button.");
    logs.push("🔍 button.outerHTML:\n" + targetButton.outerHTML.trim());

    // Scroll to and simulate real click events
    targetButton.scrollIntoView({ behavior: "smooth", block: "center" });

    const events = ["pointerover", "pointerenter", "mousemove", "mousedown", "mouseup", "click"];
    for (const type of events) {
      const event = new MouseEvent(type, {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1,
      });
      targetButton.dispatchEvent(event);
    }

    logs.push("✅ Click simulation dispatched successfully.");
    return { success: true, logs };
  });

  // Print logs
  if (threeDotsClick.logs && Array.isArray(threeDotsClick.logs)) {
    threeDotsClick.logs.forEach(log => console.log("→", log));
  }

  if (!threeDotsClick.success) {
    console.log("❌ Failed to click the target 'Actions' button.");
  } else {
    console.log("✅ Successfully clicked the target 'Actions' button.");
  }

  await new Promise(resolve => setTimeout(resolve, 1000));


  const deleteTicketTypeButton = await page.evaluate(() => {
    const logs = [];

    // Step 1: Get all menu items with the expected class
    const menuItems = Array.from(document.querySelectorAll('.lux-menu-item'));

    if (menuItems.length === 0) {
      logs.push("❌ No elements with class 'lux-menu-item' found.");
      return { success: false, logs };
    }

    // Step 2: Find the one with the 'Delete Ticket Type' title
    const target = menuItems.find(item => {
      const titleDiv = item.querySelector('.title');
      return titleDiv?.textContent?.trim() === 'Delete Ticket Type';
    });

    if (!target) {
      logs.push("❌ Could not find the 'Delete Ticket Type' menu item.");
      return { success: false, logs };
    }

    // Step 3: Scroll into view and simulate click
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const events = ['pointerover', 'pointerenter', 'mousemove', 'mousedown', 'mouseup', 'click'];
    for (const type of events) {
      const event = new MouseEvent(type, {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1,
      });
      target.dispatchEvent(event);
    }

    logs.push("✅ Successfully clicked 'Delete Ticket Type'.");
    return { success: true, logs };
  });

  // Print logs
  if (deleteTicketTypeButton.logs && Array.isArray(deleteTicketTypeButton.logs)) {
    deleteTicketTypeButton.logs.forEach(log => console.log("→", log));
  }

  if (!deleteTicketTypeButton.success) {
    console.log("❌ Failed to click the 'Delete Ticket Type' menu item.");
  } else {
    console.log("✅ Clicked 'Delete Ticket Type' menu item.");
  }

  // await page.waitForTimeout(2000);
  await new Promise(resolve => setTimeout(resolve, 1000));


  const finalDeleteButtonInModal = await page.evaluate(() => {
    const logs = [];
  
    // Target the modal wrapper more specifically
    const modal = document.querySelector('.lux-modal-body .alert-wrapper');
  
    if (!modal) {
      logs.push("❌ Could not find '.alert-wrapper' inside '.lux-modal-body'.");
      return { success: false, logs };
    }
  
    // Find the delete button with inner label text 'Delete'
    const deleteButton = Array.from(modal.querySelectorAll('button')).find(btn => {
      const label = btn.querySelector('.label');
      return label && label.textContent.trim() === 'Delete';
    });
  
    if (!deleteButton) {
      logs.push("❌ Could not find 'Delete' button inside modal.");
      return { success: false, logs };
    }
  
    deleteButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
    const events = ['pointerover', 'pointerenter', 'mousemove', 'mousedown', 'mouseup', 'click'];
    for (const type of events) {
      const event = new MouseEvent(type, {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1,
      });
      deleteButton.dispatchEvent(event);
    }
  
    logs.push("✅ Clicked the 'Delete' button inside modal.");
    return { success: true, logs };
  });
  
  // Output logs
  if (finalDeleteButtonInModal.logs && Array.isArray(finalDeleteButtonInModal.logs)) {
    finalDeleteButtonInModal.logs.forEach(log => steps.push(log));
  }
  
  if (!finalDeleteButtonInModal.success) {
    steps.push("❌ Failed to click modal 'Delete' button.");
  } else {
    steps.push("✅ Modal 'Delete' button clicked.");
  }
  
  await new Promise(resolve => setTimeout(resolve, 10000));

  return true;

}



app.post("/create-tickets", async (req, res) => {
  const steps = [];
  const { eventID, purchaseDeadline, pricingPerSeat } = req.body;
  if (!eventID) return res.status(400).send("Missing eventID");

  try {
    steps.push("Launching browser");
    const browser = await launchBrowser();
    const page = await browser.newPage();

    page.on("error", err => console.error("Page crashed:", err));
    page.on("pageerror", err => console.error("Page error:", err));

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114 Safari/537.36"
    );

    steps.push("Opening google.com");
    await page.goto("https://www.google.com", { timeout: 30000 });

    steps.push("Redirecting to lu.ma/signin");
    await page.evaluate(() => {
      window.location.href = "https://lu.ma/signin";
    });
    await page.waitForNavigation({ timeout: 60000 });

    steps.push("Typing email");
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.type('input[type="email"]', process.env.LUMA_EMAIL, { delay: 50 });

    steps.push("Clicking Continue with Email");
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(b =>
        b.textContent.includes("Continue with Email")
      );
      if (btn) btn.click();
    });

    steps.push("Waiting for password field");
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.waitForSelector('input[type="password"]', {
      timeout: 15000,
      visible: true,
    });

    steps.push("Typing password");
    await page.type('input[type="password"]', process.env.LUMA_PASSWORD, { delay: 50 });

    steps.push("Waiting for Continue button");
    await page.waitForFunction(() => {
      const btn = [...document.querySelectorAll("button")].find(b =>
        b.textContent.trim() === "Continue"
      );
      return btn && !btn.disabled;
    }, { timeout: 15000 });

    steps.push("Clicking final Continue");
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(b =>
        b.textContent.trim() === "Continue"
      );
      if (btn) btn.click();
    });

    steps.push("Waiting for dashboard");
    await page.waitForNavigation({ timeout: 60000, waitUntil: "networkidle0" });

    const currentUrl = page.url();
    if (!currentUrl.startsWith("https://lu.ma/home")) {
      throw new Error("Login did not redirect to dashboard");
    }

    const targetURL = `https://lu.ma/event/manage/${eventID}/registration`;
    steps.push("Navigating to: " + targetURL);
    await page.goto(targetURL, { timeout: 60000 });

    await new Promise(r => setTimeout(r, 2000));

    await deleteDefaultTicket(page, steps); // 🔥 NEW STEP
    steps.push("✅ Default ticket deleted successfully");

    await new Promise(r => setTimeout(r, 1000));

    await createTicket(
      page,
      steps,
      "Early Bird Ticket",
      "Early-bird access to networking dinner (food, beverage & gratuity not included in price)",
      purchaseDeadline,
      pricingPerSeat
    );

    await new Promise(r => setTimeout(r, 1000));
    await createTicket(
      page,
      steps,
      "General Ticket",
      "Access to networking dinner (food, beverage & gratuity not included in price)",
      purchaseDeadline,
      pricingPerSeat
    );
    await new Promise(r => setTimeout(r, 500));

    // steps.push("✅ Both tickets created successfully");
    await browser.close();
    steps.push("✅ Browser closed");

    return res.send({ status: "success", steps });
  } catch (err) {
    console.error("❌ Error during ticket creation:", err.message, err);
    return res.status(500).json({ status: "error", steps, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));