// Cria o ADMINISTRADOR PRINCIPAL pelo terminal (alternativa à tela /admin/setup).
//   DATABASE_URL=postgres://... ADMIN_PASSWORD='...' npm run admin:create -- --nome "Seu Nome" --email voce@dominio.com
function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const fullName = arg("nome");
  const email = arg("email");
  const password = process.env.ADMIN_PASSWORD;
  if (!fullName || !email || !password) {
    console.log('Uso: ADMIN_PASSWORD="senha" npm run admin:create -- --nome "Nome" --email email@dominio.com');
    process.exit(1);
  }
  const { createOwner } = await import("../src/server/services/users");
  const user = await createOwner({ fullName, email, password });
  console.log(`Administrador principal criado: ${user.email}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
