import { expect, test } from "@playwright/test";

/**
 * Fluxo principal (§39): cliente escolhe a marca → produto → variação →
 * carrinho → checkout → pedido salvo com número → confirmação.
 * Usa os dados DEMO do modo demonstração.
 */
test("cliente finaliza um pedido na BRAVUS", async ({ page }) => {
  // O pedido abre o WhatsApp sozinho (wa.me); aqui só conferimos o link gerado.
  await page.route("**://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>wa.me</title>" }));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: /BRAVUS/ }).first().click();
  await expect(page).toHaveURL(/\/bravus$/);

  // Abre um produto da listagem de Camisetas (tem 3 cores × 4 tamanhos).
  await page.goto("/bravus/camisetas");
  await page.locator("article a").first().click();
  await expect(page.getByRole("button", { name: "Adicionar ao carrinho" })).toBeVisible();

  // Escolhe o primeiro tamanho disponível.
  const sizeButtons = page.locator("fieldset").filter({ hasText: "Tamanho" }).getByRole("button");
  const count = await sizeButtons.count();
  for (let i = 0; i < count; i++) {
    if (await sizeButtons.nth(i).isEnabled()) {
      await sizeButtons.nth(i).click();
      break;
    }
  }
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await expect(page.getByText("Adicionado ao carrinho.")).toBeVisible();

  await page.getByRole("link", { name: "Ver carrinho" }).click();
  await expect(page.getByRole("heading", { name: "Carrinho" })).toBeVisible();
  await expect(page.getByText("Subtotal")).toBeVisible();
  await page.getByRole("link", { name: "Finalizar pedido" }).click();

  await page.getByLabel("Nome completo").fill("Cliente Teste E2E");
  await page.getByLabel("Telefone", { exact: true }).fill("(81) 99876-5432");
  await page.getByRole("radio", { name: /Receber no meu endereço/ }).check();
  await page.getByLabel(/Endereço/).fill("Rua do Teste, 10");
  await page.getByLabel("Cidade", { exact: true }).fill("Recife");
  await page.getByLabel("Estado (UF)").selectOption("PE");
  await page.getByRole("button", { name: /Confirmar e enviar pelo WhatsApp/ }).click();

  await expect(page).toHaveURL(/\/bravus\/pedido\/\d+\?t=/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Seu pedido foi registrado");
  await expect(page.getByText(/Pedido #BR-\d{6}/)).toBeVisible();
  // A mensagem do carrinho vai para o WhatsApp da loja.
  const href = await page.getByRole("link", { name: /Abrir WhatsApp e enviar pedido/ }).getAttribute("href");
  expect(href).toMatch(/^https:\/\/wa\.me\/5581973314464\?text=/);
  expect(decodeURIComponent(href!)).toContain("Cliente Teste E2E");
  expect(decodeURIComponent(href!)).toContain("Entrega: Rua do Teste, 10, Recife - PE");
});

test("cliente escolhe retirar na loja (sem endereço)", async ({ page }) => {
  await page.route("**://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>wa.me</title>" }));
  // Camisetas da BRAVUS têm estoque garantido nos dados DEMO (a retirada vale para as duas lojas).
  await page.goto("/bravus/camisetas");
  await page.locator("article a").first().click();
  await expect(page.getByRole("button", { name: "Adicionar ao carrinho" })).toBeVisible();
  await page.waitForLoadState("networkidle"); // espera a página ficar interativa antes de escolher o tamanho
  const sizeButtons = page.locator("fieldset").filter({ hasText: "Tamanho" }).getByRole("button");
  const count = await sizeButtons.count();
  for (let i = 0; i < count; i++) {
    if (await sizeButtons.nth(i).isEnabled()) {
      await sizeButtons.nth(i).click();
      break;
    }
  }
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await expect(page.getByText("Adicionado ao carrinho.")).toBeVisible();
  await page.getByRole("link", { name: "Ver carrinho" }).click();
  await page.getByRole("link", { name: "Finalizar pedido" }).click();

  await page.getByLabel("Nome completo").fill("Cliente Retirada E2E");
  await page.getByLabel("Telefone", { exact: true }).fill("(81) 99123-4567");
  // Sem escolher a forma de entrega, o pedido não sai.
  await page.getByRole("button", { name: /Confirmar e enviar pelo WhatsApp/ }).click();
  await expect(page.getByText("Escolha retirar na loja ou receber no seu endereço.").first()).toBeVisible();

  await page.getByRole("radio", { name: /Retirar na loja/ }).check();
  await expect(page.getByText("Rua Desembargador Oscar Coutinho, 15", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver a loja no mapa" })).toHaveAttribute("href", /google\.com\/maps/);
  await expect(page.getByLabel(/Endereço/)).toHaveCount(0);
  await page.getByRole("button", { name: /Confirmar e enviar pelo WhatsApp/ }).click();

  await expect(page).toHaveURL(/\/bravus\/pedido\/\d+\?t=/);
  const href = await page.getByRole("link", { name: /Abrir WhatsApp e enviar pedido/ }).getAttribute("href");
  expect(decodeURIComponent(href!)).toContain("Entrega: Retirada na loja: Rua Desembargador Oscar Coutinho, 15");
});

test("página de confirmação exige a assinatura do pedido", async ({ page }) => {
  const res = await page.goto("/bravus/pedido/1");
  expect(res?.status()).toBe(404);
});

test("painel exige login", async ({ page }) => {
  await page.goto("/admin/pedidos");
  await expect(page).toHaveURL(/\/admin\/(login|setup)/);
});
