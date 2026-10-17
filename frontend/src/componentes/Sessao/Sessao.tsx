import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import {
  aoTerminarASessao,
  cadastrar as cadastrarNaApi,
  type Credenciais,
  type DadosDeCadastro,
  entrar as entrarNaApi,
  eu,
  sair as sairDaApi,
} from "../../api/sessao";
import type { Usuario } from "../../api/tipos";

/** Aviso mostrado na tela de entrar quando a sessão acaba no meio do uso. */
export const MENSAGEM_SESSAO_TERMINOU = "Sua sessão terminou. Entre de novo.";

export type EstadoDaSessao = "verificando" | "anonimo" | "autenticado";

export type ValorDaSessao = {
  estado: EstadoDaSessao;
  /** A pessoa conectada; `null` fora do estado `autenticado`. */
  usuario: Usuario | null;
  /** Aviso para a tela de entrar (sessão terminada, servidor fora do ar). */
  aviso: string | null;
  /** Entra e busca a pessoa; lança o ErroDaApiCliente se não conseguir. */
  entrar: (credenciais: Credenciais) => Promise<void>;
  /** Cria a conta da pessoa e já entra; lança o ErroDaApiCliente se não conseguir. */
  cadastrar: (dados: DadosDeCadastro) => Promise<void>;
  /** Sai; volta a `anonimo` mesmo sem resposta do servidor. Nunca falha. */
  sair: () => Promise<void>;
};

type Situacao = Pick<ValorDaSessao, "estado" | "usuario" | "aviso">;

const Contexto = createContext<ValorDaSessao | null>(null);

/** O aviso de quando a verificação inicial falha; 401 é só "ninguém entrou ainda". */
function avisoDaVerificacao(erro: unknown): string | null {
  if (!(erro instanceof ErroDaApiCliente) || erro.codigo === "sem_resposta") {
    return MENSAGEM_SEM_RESPOSTA;
  }
  return erro.status === 401 ? null : erro.mensagem;
}

/**
 * Guarda o estado da sessão. Ao montar, `GET /auth/eu` decide entre
 * `autenticado` e `anonimo`. Um 401 `nao_autenticado` no meio do uso (avisado
 * pelo cliente) volta a `anonimo` com o aviso de sessão terminada, uma vez só,
 * e com o cache já limpo. Nada da sessão é guardado no navegador: ela vive no
 * cookie HttpOnly.
 */
export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const [situacao, definirSituacao] = useState<Situacao>({
    estado: "verificando",
    usuario: null,
    aviso: null,
  });
  // O estado mais recente, para os ouvintes fora do ciclo de render.
  const estadoAtual = useRef<EstadoDaSessao>("verificando");
  // Enquanto a pessoa sai, o 401 de "já tinha saído" não é "sessão terminada".
  const saindo = useRef(false);

  const mudar = useCallback((nova: Situacao) => {
    estadoAtual.current = nova.estado;
    definirSituacao(nova);
  }, []);

  useEffect(() => {
    const controle = new AbortController();
    eu(controle.signal).then(
      (usuario) => {
        if (!controle.signal.aborted) mudar({ estado: "autenticado", usuario, aviso: null });
      },
      (erro: unknown) => {
        if (controle.signal.aborted) return;
        mudar({ estado: "anonimo", usuario: null, aviso: avisoDaVerificacao(erro) });
      },
    );
    return () => controle.abort();
  }, [mudar]);

  useEffect(
    () =>
      aoTerminarASessao(() => {
        // Só uma sessão ativa pode terminar: vários 401 seguidos contam uma vez.
        if (estadoAtual.current !== "autenticado" || saindo.current) return;
        mudar({ estado: "anonimo", usuario: null, aviso: MENSAGEM_SESSAO_TERMINOU });
      }),
    [mudar],
  );

  const entrar = useCallback(
    async (credenciais: Credenciais) => {
      await entrarNaApi(credenciais);
      const usuario = await eu();
      mudar({ estado: "autenticado", usuario, aviso: null });
    },
    [mudar],
  );

  const cadastrar = useCallback(
    async (dados: DadosDeCadastro) => {
      await cadastrarNaApi(dados);
      await entrar({ email: dados.email, senha: dados.senha });
    },
    [entrar],
  );

  const sair = useCallback(async () => {
    saindo.current = true;
    try {
      await sairDaApi();
    } finally {
      saindo.current = false;
    }
    mudar({ estado: "anonimo", usuario: null, aviso: null });
  }, [mudar]);

  const valor = useMemo<ValorDaSessao>(
    () => ({ ...situacao, entrar, cadastrar, sair }),
    [situacao, entrar, cadastrar, sair],
  );

  return <Contexto value={valor}>{children}</Contexto>;
}

/** O estado da sessão e as ações de entrar e sair. */
export function useSessao(): ValorDaSessao {
  const valor = useContext(Contexto);
  if (valor === null) throw new Error("useSessao precisa estar dentro do ProvedorDeSessao.");
  return valor;
}
