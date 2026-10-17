import { useState } from "react";

import type { Usuario } from "./api/tipos";
import type { Navegacao, Tela } from "./componentes/Navegacao/telas";
import { Cadastrar } from "./componentes/Cadastrar/Cadastrar";
import { Entrar } from "./componentes/Entrar/Entrar";
import { ProvedorDeSessao, useSessao } from "./componentes/Sessao/Sessao";
import { VerificandoASessao } from "./componentes/Sessao/VerificandoASessao";
import { Contas } from "./paginas/Contas";
import { Faturas } from "./paginas/Faturas";
import { Inicio } from "./paginas/Inicio";
import { Orcamento } from "./paginas/Orcamento";
import { Outros } from "./paginas/Outros";
import { Perfil } from "./paginas/Perfil";
import { Tags } from "./paginas/Tags";
import { Transacoes } from "./paginas/Transacoes";

/**
 * A área de quem entrou: guarda a tela atual (sem roteador). Desmontada ao
 * sair ou ao perder a sessão, então quem entra de novo começa no Início.
 */
function AreaAutenticada({ usuario, aoSair }: { usuario: Usuario; aoSair: () => void }) {
  const [tela, definirTela] = useState<Tela>("inicio");
  // Só a ida de Transações sem contas abre Contas com o formulário; trocar de aba o limpa.
  const [contasComFormulario, definirContasComFormulario] = useState(false);
  const navegacao: Navegacao = {
    nomeDaPessoa: usuario.nome,
    importacaoBancaria: usuario.importacao_bancaria === true,
    tela,
    aoIrPara: (destino, opcoes) => {
      definirContasComFormulario(destino === "contas" && opcoes?.abrirFormulario === true);
      definirTela(destino);
    },
    aoSair,
  };
  switch (tela) {
    case "inicio":
      return <Inicio navegacao={navegacao} />;
    case "transacoes":
      return <Transacoes navegacao={navegacao} />;
    case "orcamento":
      return <Orcamento navegacao={navegacao} />;
    case "contas":
      return <Contas navegacao={navegacao} formularioInicialAberto={contasComFormulario} />;
    case "faturas":
      return <Faturas navegacao={navegacao} />;
    case "tags":
      return <Tags navegacao={navegacao} />;
    case "outros":
      return <Outros navegacao={navegacao} />;
    case "perfil":
      return <Perfil navegacao={navegacao} />;
  }
}

/** O portão: verificando → carregamento; anônimo → tela de entrar; autenticado → o app. */
function Portao() {
  const sessao = useSessao();
  const [criandoConta, definirCriandoConta] = useState(false);
  if (sessao.estado === "verificando") return <VerificandoASessao />;
  if (sessao.estado === "anonimo" || sessao.usuario === null) {
    if (criandoConta) {
      return <Cadastrar aoCadastrar={sessao.cadastrar} aoVoltar={() => definirCriandoConta(false)} />;
    }
    return (
      <Entrar
        aoEntrar={sessao.entrar}
        aviso={sessao.aviso}
        aoCriarConta={() => definirCriandoConta(true)}
      />
    );
  }
  return <AreaAutenticada usuario={sessao.usuario} aoSair={() => void sessao.sair()} />;
}

export default function App() {
  return (
    <ProvedorDeSessao>
      <Portao />
    </ProvedorDeSessao>
  );
}
