import estilos from "./VerificandoASessao.module.css";

/** Enquanto `GET /auth/eu` não responde: um carregamento anunciado por `role="status"`. */
export function VerificandoASessao() {
  return (
    <main className={estilos.pagina} aria-busy="true">
      <p role="status" className={estilos.texto}>
        Verificando a sessão…
      </p>
    </main>
  );
}
