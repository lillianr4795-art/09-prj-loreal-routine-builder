/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearchInput = document.getElementById("productSearch");
const directionToggle = document.getElementById("directionToggle");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectedProductsButton = document.getElementById("clearSelectedProducts");
const selectionStorageStatus = document.getElementById("selectionStorageStatus");
const generateRoutineButton = document.getElementById("generateRoutine");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendBtn");
const selectedProducts = new Map();
const selectedProductsStorageKey = "selectedProducts";
const workerUrl = "https://api-proxy.lrpinker.workers.dev/v1/responses";
const systemMessage = {
  role: "system",
  content:
    "You are a helpful beauty advisor. Answer questions about the generated routine and related topics such as skincare, haircare, makeup, and fragrance. Use web search for current information about L'Oréal products, ingredients, or routines, and cite your sources. Politely decline unrelated requests and guide the user back to beauty topics. When creating or adjusting a routine, use only the products the user selected. Explain the order and when to use each product, and do not invent product details.",
};
let conversationMessages = [];
let currentProducts = [];

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map(
      (product) => `
    <article class="product-card${selectedProducts.has(product.id) ? " selected" : ""}">
      <label class="product-select">
        <input
          type="checkbox"
          class="product-checkbox"
          data-product-id="${product.id}"
          aria-label="Select ${product.name}"
          ${selectedProducts.has(product.id) ? "checked" : ""}
        >
        <img src="${product.image}" alt="">
        <span class="product-info">
          <span class="product-name">${product.name}</span>
          <span class="product-brand">${product.brand}</span>
        </span>
      </label>
      <button
        type="button"
        class="description-toggle"
        aria-expanded="false"
        aria-controls="product-description-${product.id}"
      >
        Show description
      </button>
      <p id="product-description-${product.id}" class="product-description" hidden>
        ${product.description}
      </p>
    </article>
  `
    )
    .join("");
}

/* Show selected products and let users remove them from the list */
function displaySelectedProducts() {
  selectedProductsList.replaceChildren();

  if (selectedProducts.size === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "No products selected yet.";
    selectedProductsList.append(emptyMessage);
    return;
  }

  Array.from(selectedProducts.values()).forEach((product) => {
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "selected-product";
    removeButton.dataset.productId = product.id;
    removeButton.setAttribute("aria-label", `Remove ${product.name}`);
    removeButton.textContent = `${product.name} ×`;
    selectedProductsList.append(removeButton);
  });
}

/* Filter products by the chosen category and any search words */
function displayFilteredProducts() {
  const selectedCategory = categoryFilter.value;
  if (!selectedCategory) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Select a category to view products
      </div>
    `;
    return;
  }

  const searchTerm = productSearchInput.value.trim().toLowerCase();
  const filteredProducts = currentProducts.filter((product) => {
    const matchesCategory = product.category === selectedCategory;
    const matchesSearch = [
      product.name,
      product.brand,
      product.category,
      product.description,
    ].some((value) => value.toLowerCase().includes(searchTerm));

    return matchesCategory && matchesSearch;
  });

  if (filteredProducts.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products match your search in this category
      </div>
    `;
    return;
  }

  displayProducts(filteredProducts);
}

/* Restore saved products, checking their data before using it */
function loadSavedProducts() {
  try {
    const savedProducts = localStorage.getItem(selectedProductsStorageKey);
    if (!savedProducts) return;

    const products = JSON.parse(savedProducts);
    if (!Array.isArray(products)) {
      throw new Error("Saved products must be a list.");
    }

    let hasInvalidProduct = false;
    products.forEach((product) => {
      if (
        !product ||
        !Number.isInteger(product.id) ||
        typeof product.name !== "string" ||
        typeof product.brand !== "string" ||
        typeof product.category !== "string" ||
        typeof product.description !== "string"
      ) {
        hasInvalidProduct = true;
        return;
      }

      selectedProducts.set(product.id, {
        id: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        description: product.description,
      });
    });

    if (hasInvalidProduct) {
      selectionStorageStatus.textContent =
        "Some saved products could not be restored. Use Clear all to remove them.";
    }
  } catch {
    selectionStorageStatus.textContent =
      "Saved products could not be read. Use Clear all to remove them.";
  }
}

/* Save selected products so they remain selected after a reload */
function saveSelectedProducts() {
  try {
    if (selectedProducts.size === 0) {
      localStorage.removeItem(selectedProductsStorageKey);
    } else {
      localStorage.setItem(
        selectedProductsStorageKey,
        JSON.stringify(Array.from(selectedProducts.values()))
      );
    }
    selectionStorageStatus.textContent = "";
  } catch {
    selectionStorageStatus.textContent =
      "Your selections could not be saved in this browser.";
  }
}

loadSavedProducts();
displaySelectedProducts();

/* Add chat messages as text so responses are displayed safely */
function displayChatMessage(role, content, citations = []) {
  const message = document.createElement("div");
  message.className = `chat-message ${role}`;

  const label = document.createElement("strong");
  label.textContent =
    role === "assistant" ? "Routine Advisor" : role === "error" ? "Notice" : "You";

  const messageText = document.createElement("p");
  messageText.textContent = content;
  messageText.dir = "auto";

  message.append(label, messageText);

  if (role === "assistant" && citations.length > 0) {
    const citationList = document.createElement("ul");
    citationList.className = "chat-citations";

    citations.forEach((citation) => {
      const listItem = document.createElement("li");
      try {
        const url = new URL(citation.url);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          throw new Error("Unsupported citation link.");
        }

        const link = document.createElement("a");
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = citation.title || url.hostname;
        listItem.append(link);
      } catch {
        listItem.textContent = "A source link could not be displayed.";
      }
      citationList.append(listItem);
    });

    if (citationList.childElementCount > 0) {
      const citationHeading = document.createElement("strong");
      citationHeading.textContent = "Sources";
      message.append(citationHeading, citationList);
    }
  }

  chatWindow.append(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return message;
}

/* Use web search and keep citations from the Responses API */
async function getAssistantReply(messages) {
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-6-astra",
      tools: [{ type: "web_search" }],
      input: messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`The routine request failed (HTTP ${response.status}).`);
  }

  const data = await response.json();
  const textParts = (data.output || [])
    .filter((item) => item.type === "message" && item.role === "assistant")
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text");
  const reply = textParts.map((item) => item.text).join("\n").trim();
  const citations = textParts
    .flatMap((item) => item.annotations || [])
    .filter((item) => item.type === "url_citation" && item.url)
    .filter(
      (citation, index, allCitations) =>
        allCitations.findIndex((item) => item.url === citation.url) === index
    );

  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error("The routine service returned an empty or invalid response.");
  }

  return { reply, citations };
}

function assistantHistoryContent(reply, citations) {
  if (citations.length === 0) return reply;

  const sources = citations
    .map((citation) => `${citation.title || citation.url}: ${citation.url}`)
    .join("\n");
  return `${reply}\n\nSources:\n${sources}`;
}

function setRequestPending(isPending) {
  generateRoutineButton.disabled = isPending;
  sendButton.disabled = isPending;
  userInput.disabled = isPending;
}

/* Change the page direction between left-to-right and right-to-left */
directionToggle.addEventListener("click", () => {
  const isRtl = document.documentElement.dir !== "rtl";
  document.documentElement.dir = isRtl ? "rtl" : "ltr";
  directionToggle.setAttribute("aria-pressed", isRtl);
  directionToggle.textContent = isRtl ? "Switch to LTR" : "Switch to RTL";
});

/* Filter products when the category changes or the user searches */
categoryFilter.addEventListener("change", async () => {
  currentProducts = await loadProducts();
  displayFilteredProducts();
});
productSearchInput.addEventListener("input", displayFilteredProducts);

/* Select or unselect a product using its card checkbox */
productsContainer.addEventListener("change", (e) => {
  const productCheckbox = e.target.closest(".product-checkbox");
  if (!productCheckbox) return;

  const productId = Number(productCheckbox.dataset.productId);
  const product = currentProducts.find((item) => item.id === productId);
  if (!product) return;

  if (productCheckbox.checked) {
    selectedProducts.set(productId, product);
  } else {
    selectedProducts.delete(productId);
  }
  productCheckbox.closest(".product-card").classList.toggle(
    "selected",
    productCheckbox.checked
  );
  saveSelectedProducts();
  displaySelectedProducts();
});

/* Expand or collapse the product description */
productsContainer.addEventListener("click", (e) => {
  const descriptionButton = e.target.closest(".description-toggle");
  if (!descriptionButton) return;

  const description = document.getElementById(
    descriptionButton.getAttribute("aria-controls")
  );
  description.hidden = !description.hidden;
  descriptionButton.setAttribute("aria-expanded", !description.hidden);
  descriptionButton.textContent = description.hidden
    ? "Show description"
    : "Hide description";
});

/* Remove a product directly from the selected-products list */
selectedProductsList.addEventListener("click", (e) => {
  const removeButton = e.target.closest(".selected-product");
  if (!removeButton) return;

  const productId = Number(removeButton.dataset.productId);
  selectedProducts.delete(productId);
  saveSelectedProducts();
  displaySelectedProducts();

  const productCard = productsContainer.querySelector(
    `.product-checkbox[data-product-id="${productId}"]`
  );
  if (productCard) {
    productCard.checked = false;
    productCard.closest(".product-card").classList.remove("selected");
  }
});

/* Clear every selected product from the list and saved browser data */
clearSelectedProductsButton.addEventListener("click", () => {
  selectedProducts.clear();
  productsContainer.querySelectorAll(".product-checkbox").forEach((checkbox) => {
    checkbox.checked = false;
    checkbox.closest(".product-card").classList.remove("selected");
  });
  saveSelectedProducts();
  displaySelectedProducts();
});

/* Generate a routine using only products selected by the user */
generateRoutineButton.addEventListener("click", async () => {
  const products = Array.from(selectedProducts.values()).map(
    ({ name, brand, category, description }) => ({
      name,
      brand,
      category,
      description,
    })
  );

  if (products.length === 0) {
    displayChatMessage("error", "Select at least one product to generate a routine.");
    return;
  }

  const userMessage = {
    role: "user",
    content: `Create a personalized routine using these selected products:\n${JSON.stringify(
      products,
      null,
      2
    )}`,
  };
  const requestMessages = [systemMessage, userMessage];

  displayChatMessage(
    "user",
    `Generate a routine using: ${products.map((product) => product.name).join(", ")}`
  );
  setRequestPending(true);

  try {
    const response = await getAssistantReply(requestMessages);
    conversationMessages = [
      ...requestMessages,
      {
        role: "assistant",
        content: assistantHistoryContent(response.reply, response.citations),
      },
    ];
    const routineMessage = displayChatMessage(
      "assistant",
      response.reply,
      response.citations
    );
    routineMessage.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    displayChatMessage("error", error.message);
  } finally {
    setRequestPending(false);
  }
});

/* Send follow-up questions with the routine conversation for context */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const question = userInput.value.trim();
  if (!question) return;

  if (conversationMessages.length === 0) {
    displayChatMessage("error", "Generate a routine before asking a follow-up question.");
    return;
  }

  const userMessage = { role: "user", content: question };
  const requestMessages = [...conversationMessages, userMessage];
  displayChatMessage("user", question);
  setRequestPending(true);

  try {
    const response = await getAssistantReply(requestMessages);
    conversationMessages = [
      ...requestMessages,
      {
        role: "assistant",
        content: assistantHistoryContent(response.reply, response.citations),
      },
    ];
    displayChatMessage("assistant", response.reply, response.citations);
    userInput.value = "";
  } catch (error) {
    displayChatMessage("error", error.message);
  } finally {
    setRequestPending(false);
  }
});
