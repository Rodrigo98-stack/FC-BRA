import { expect, test, type Page } from "@playwright/test";

/**
 * Painel: primeiro acesso (ADMINISTRADOR PRINCIPAL), confirmação de pedido
 * com baixa de estoque, cadastro simples e convite com link manual.
 * Variáveis: E2E_SETUP_TOKEN (se o servidor exigir), E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD.
 */
const email = process.env.E2E_ADMIN_EMAIL ?? "admin.e2e@fcbra.local";
const password = process.env.E2E_ADMIN_PASSWORD ?? "SenhaForte123";

async function signIn(page: Page) {
  await page.goto("/admin");
  if (page.url().includes("/admin/setup")) {
    const token = page.getByLabel(/Código de instalação/);
    if (await token.count()) await token.fill(process.env.E2E_SETUP_TOKEN ?? "");
    await page.getByLabel("Nome completo").fill("Admin E2E");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel(/^Senha/).fill(password);
    await page.getByLabel("Confirme a senha").fill(password);
    await page.getByRole("button", { name: "Criar administrador principal" }).click();
  } else if (page.url().includes("/admin/login")) {
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel(/^Senha/).fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: /Dashboard/ })).toBeVisible();
}

test.describe.serial("painel administrativo", () => {
  test("confirmar pedido baixa o estoque", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/pedidos?status=pedido_recebido");
    await page.locator("table a[href^='/admin/pedidos/']").first().click();
    await expect(page.getByRole("heading", { level: 1, name: /Pedido #/ })).toBeVisible();
    await page.getByLabel("Novo status").selectOption("aguardando_pagamento");
    await expect(page.getByText(/vai baixar o estoque/)).toBeVisible();
    await page.getByRole("button", { name: "Aplicar status" }).click();
    await expect(page.getByText(/Estoque baixado/)).toBeVisible();
    await expect(page.getByText("baixado", { exact: true })).toBeVisible();
  });

  test("cadastra fornecedor e registra na auditoria", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/fornecedores/novo");
    await page.getByLabel(/Nome \/ razão social/).fill("Fornecedor E2E");
    await page.getByRole("button", { name: /Cadastrar fornecedor/ }).click();
    await expect(page).toHaveURL(/\/admin\/fornecedores$/);
    await expect(page.getByRole("link", { name: "Fornecedor E2E" })).toBeVisible();
    await page.goto("/admin/auditoria?q=fornecedores.criar");
    await expect(page.getByText("cadastrou fornecedor").first()).toBeVisible();
  });

  test("convite gera link manual quando não há e-mail configurado", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/equipe/convidar");
    await page.getByLabel(/E-mail/).fill(`convidado.${Date.now()}@fcbra.local`);
    await page.getByLabel(/Papel/).selectOption({ label: "Vendedor" });
    await page.getByRole("button", { name: "Criar convite" }).click();
    await expect(page.getByText("Link do convite")).toBeVisible();
    const link = await page.locator("input[readonly]").inputValue();
    expect(link).toMatch(/\/admin\/convite\/[A-Za-z0-9_-]{20,}$/);
  });
});
