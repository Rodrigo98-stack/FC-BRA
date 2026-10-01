import { expect, test } from "@playwright/test";

/**
 * Fluxo principal (§39): cliente escolhe a marca → produto → variação →
 * carrinho → checkout → pedido salvo com número → confirmação.
 * Usa os dados DEMO do modo demonstração.
 */
test("cliente finaliza um pedido na BRAVUS", async ({ page }) => {
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
  await page.getByLabel("CEP", { exact: true }).fill("50000-000");
  await page.getByLabel(/Endereço/).fill("Rua do Teste, 10");
  await page.getByLabel("Cidade", { exact: true }).fill("Recife");
  await page.getByLabel("Estado (UF)").selectOption("PE");
  await page.getByRole("button", { name: /Confirmar e enviar pelo WhatsApp/ }).click();

  await expect(page).toHaveURL(/\/bravus\/pedido\/\d+\?t=/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Seu pedido foi registrado");
  await expect(page.getByText(/Pedido #BR-\d{6}/)).toBeVisible();
});

test("página de confirmação exige a assinatura do pedido", async ({ page }) => {
  const res = await page.goto("/bravus/pedido/1");
  expect(res?.status()).toBe(404);
});

test("painel exige login", async ({ page }) => {
  await page.goto("/admin/pedidos");
  await expect(page).toHaveURL(/\/admin\/(login|setup)/);
});
