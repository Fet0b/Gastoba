import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { aplicarAparencia } from "./aparencia/aplicarAparencia";

import type { Aparencia, Usuario } from "./api/tipos";
import type { Navegacao } from "./componentes/Navegacao/telas";
import { Cadastrar } from "./componentes/Cadastrar/Cadastrar";
import { Entrar } from "./componentes/Entrar/Entrar";
import { useRota, reiniciarARota } from "./componentes/Navegacao/useRota";
import { ProvedorDeSessao, useSessao } from "./componentes/Sessao/Sessao";
import { VerificandoASessao } from "./componentes/Sessao/VerificandoASessao";
import { Caixinhas } from "./paginas/Caixinhas";
import { Contas } from "./paginas/Contas";
import { Faturas } from "./paginas/Faturas";
import { Inicio } from "./paginas/Inicio";
import { Investimentos } from "./paginas/Investimentos";
import { Orcamento } from "./paginas/Orcamento";
import { Outros } from "./paginas/Outros";
import { Perfil } from "./paginas/Perfil";
import { Tags } from "./paginas/Tags";
import { Transacoes } from "./paginas/Transacoes";

/**
 * A área de quem entrou: a tela, o mês, a vista e a data vêm do endereço (`useRota`, sem
 * biblioteca de roteador); só o que é efêmero fica em estado. Desmontada ao sair ou ao perder a
 * sessão, então quem entra de novo começa no Início.
 */
function AreaAutenticada({
  usuario,
  aoSair,
  aoMudarAparencia,
}: {
  usuario: Usuario;
  aoSair: () => void;
  aoMudarAparencia: (aparencia: Aparencia | undefined) => void;
}) {
  const { rota, irPara } = useRota();
  const { tela, dataDoMovimento, vistaDeTransacoes } = rota;
  // Só a ida a Transações por "Novo gasto"/N abre o compositor; trocar de aba o limpa.
  const [abrirCompositor, definirAbrirCompositor] = useState(false);
  // Só a ida de Transações sem contas abre Contas com o formulário; trocar de aba o limpa.
  const [contasComFormulario, definirContasComFormulario] = useState(false);
  const navegacao: Navegacao = {
    nomeDaPessoa: usuario.nome,
    nomeDoApp: usuario.aparencia?.nome,
    marca: usuario.aparencia?.marca,
    aparencia: usuario.aparencia,
    aoMudarAparencia,
    importacaoBancaria: usuario.importacao_bancaria === true,
    gestaoDeInvestimentos: usuario.gestao_de_investimentos === true,
    tela,
    aoIrPara: (destino, opcoes) => {
      definirContasComFormulario(destino === "contas" && opcoes?.abrirFormulario === true);
      definirAbrirCompositor(destino === "transacoes" && opcoes?.abrirCompositor === true);
      irPara(destino, opcoes);
    },
    aoSair,
  };
  switch (tela) {
    case "inicio":
      return <Inicio navegacao={navegacao} />;
    case "transacoes":
      return <Transacoes
          navegacao={navegacao}
          vistaInicial={vistaDeTransacoes}
          dataDoMovimento={dataDoMovimento}
          abrirCompositorAoEntrar={abrirCompositor}
        />;
    case "orcamento":
      return <Orcamento navegacao={navegacao} />;
    case "contas":
      return <Contas navegacao={navegacao} formularioInicialAberto={contasComFormulario} />;
    case "investimentos":
      return <Investimentos navegacao={navegacao} />;
    case "caixinhas":
      return <Caixinhas navegacao={navegacao} />;
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
  // A aparência vale só para quem entrou: aplicada antes de pintar a tela, limpa ao sair ou ao
  // perder a sessão (a tela de entrar é sempre a padrão).
  const aparencia = sessao.estado === "autenticado" ? (sessao.usuario?.aparencia ?? null) : null;
  useLayoutEffect(() => {
    aplicarAparencia(aparencia);
  }, [aparencia]);
  // Ao sair ou perder a sessão, o próximo login começa no Início; um link direto, antes de entrar, vale.
  const estavaAutenticado = useRef(false);
  useEffect(() => {
    if (sessao.estado === "autenticado") estavaAutenticado.current = true;
    else if (sessao.estado === "anonimo" && estavaAutenticado.current) {
      estavaAutenticado.current = false;
      reiniciarARota();
    }
  }, [sessao.estado]);
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
  return (
    <AreaAutenticada
      usuario={sessao.usuario}
      aoSair={() => void sessao.sair()}
      aoMudarAparencia={sessao.atualizarAparencia}
    />
  );
}

export default function App() {
  return (
    <ProvedorDeSessao>
      <Portao />
    </ProvedorDeSessao>
  );
}
