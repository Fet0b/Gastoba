import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { aplicarAparencia } from "../../aparencia/aplicarAparencia";
import {
  comoEscolha,
  erroDoNome,
  mesmaEscolha,
  NOME_MAXIMO_DO_APP,
} from "../../aparencia/padrao";
import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import {
  useDefinirAparencia,
  useOpcoesDeAparencia,
  useRestaurarAparencia,
} from "../../api/consultas";
import { invalidar } from "../../api/useConsulta";
import type { Aparencia, EscolhaDeAparencia } from "../../api/tipos";
import type { MensagemDoAviso } from "../Aviso/Aviso";
import { Botao } from "../Botao/Botao";
import { CampoDeTexto } from "../Campo/CampoDeTexto";
import { Cartao } from "../Cartao/Cartao";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { Titulo } from "../Titulo/Titulo";
import estilos from "./Aparencia.module.css";
import { EscolhaDaCor } from "./EscolhaDaCor";
import { EscolhaDaIntensidade } from "./EscolhaDaIntensidade";
import { EscolhaDaMarca } from "./EscolhaDaMarca";
import { EscolhaDaTextura } from "./EscolhaDaTextura";

type Propriedades = {
  /** A aparência salva da pessoa (`undefined` quando o perfil ainda não a trouxe: vale a padrão). */
  salva: Aparencia | undefined;
  /** Chamada com a aparência salva, ou `undefined` ao restaurar a padrão. */
  aoSalvar: (aparencia: Aparencia | undefined) => void;
  aoAvisar: (tipo: MensagemDoAviso["tipo"], texto: string) => void;
};

function textoDoErro(erro: unknown): string {
  if (!(erro instanceof ErroDaApiCliente) || erro.codigo === "sem_resposta") return MENSAGEM_SEM_RESPOSTA;
  return erro.mensagem;
}

/**
 * Aparência (Perfil): cor dominante, intensidade, textura, nome e logo do app. Cada mudança é uma
 * prévia na hora; "Salvar" grava, "Cancelar" e sair da tela voltam à aparência salva. Restaurar
 * a padrão fica no menu, com confirmação.
 */
export function SecaoDeAparencia({ salva, aoSalvar, aoAvisar }: Propriedades) {
  const opcoes = useOpcoesDeAparencia();
  const definir = useDefinirAparencia();
  const restaurar = useRestaurarAparencia();
  const escolhaSalva = comoEscolha(salva);
  const [rascunho, definirRascunho] = useState<EscolhaDeAparencia>(escolhaSalva);
  const [confirmandoRestauracao, definirConfirmandoRestauracao] = useState(false);
  const [erroDoServidor, definirErroDoServidor] = useState<string | null>(null);
  const gatilhoDoMenu = useRef<HTMLButtonElement>(null);

  const alterado = !mesmaEscolha(rascunho, escolhaSalva);
  const erroLocalDoNome = erroDoNome(rascunho.nome);

  // A prévia: o rascunho é aplicado a cada mudança (o título da aba também).
  useEffect(() => {
    aplicarAparencia({ ...rascunho, personalizada: true });
  }, [rascunho]);

  // Quando a aparência salva muda (salvou ou restaurou), o rascunho a acompanha.
  const chaveDaSalva = JSON.stringify(escolhaSalva);
  useEffect(() => {
    definirRascunho(JSON.parse(chaveDaSalva) as EscolhaDeAparencia);
    definirErroDoServidor(null);
  }, [chaveDaSalva]);

  // Sair da tela com rascunho volta à aparência salva (a mais recente, lida de uma ref).
  const salvaAtual = useRef(salva);
  useEffect(() => {
    salvaAtual.current = salva;
  });
  // Em efeito de layout, para o fechamento correr antes do `aplicarAparencia(null)` do App ao sair.
  useLayoutEffect(
    () => () => {
      aplicarAparencia(salvaAtual.current ?? null);
    },
    [],
  );

  function mudar(parcial: Partial<EscolhaDeAparencia>): void {
    definirRascunho((atual) => ({ ...atual, ...parcial }));
    definirErroDoServidor(null);
  }

  function cancelar(): void {
    definirRascunho(escolhaSalva);
    definirErroDoServidor(null);
    aplicarAparencia(salva ?? null);
  }

  async function salvar(): Promise<void> {
    if (erroLocalDoNome !== null || !alterado) return;
    const gravada = await definir.executar({ ...rascunho, nome: rascunho.nome.trim() });
    if (gravada === undefined) return; // a falha aparece abaixo; a prévia continua na tela
    aoSalvar(gravada);
    aoAvisar("confirmacao", "Aparência salva.");
  }

  async function restaurarPadrao(): Promise<void> {
    const feito = await restaurar.executar();
    definirConfirmandoRestauracao(false);
    if (!feito) return;
    aoSalvar(undefined);
    aoAvisar("confirmacao", "Aparência padrão restaurada.");
  }

  // O erro do servidor vira texto junto ao campo (nome) ou aviso da página (sem resposta etc.).
  useEffect(() => {
    if (definir.erro === null) return;
    if (definir.erro instanceof ErroDaApiCliente && definir.erro.codigo === "aparencia_invalida") {
      definirErroDoServidor(definir.erro.mensagem);
    } else {
      aoAvisar("erro", textoDoErro(definir.erro));
    }
  }, [definir.erro]);

  let corpo;
  if (opcoes.carregando && !opcoes.dados) {
    corpo = <Esqueleto rotulo="Carregando as opções de aparência" linhas={4} />;
  } else if (!opcoes.dados) {
    corpo = (
      <EstadoDeErro
        mensagem="Não foi possível carregar as opções de aparência."
        aoTentarDeNovo={() => invalidar("aparencia/opcoes")}
      />
    );
  } else {
    const dados = opcoes.dados;
    const falta = !alterado
      ? "Mude alguma escolha para poder salvar."
      : erroLocalDoNome !== null
        ? "Corrija o nome do app para poder salvar."
        : null;
    corpo = (
      <form
        className={estilos.formulario}
        aria-label="Aparência do app"
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void salvar();
        }}
      >
        <EscolhaDaCor matiz={rascunho.matiz} aoMudar={(matiz) => mudar({ matiz })} />
        <EscolhaDaIntensidade
          opcoes={dados.intensidades}
          valor={rascunho.intensidade}
          aoMudar={(intensidade) => mudar({ intensidade })}
        />
        <EscolhaDaTextura
          opcoes={dados.texturas}
          valor={rascunho.textura}
          aoMudar={(textura) => mudar({ textura })}
        />
        <CampoDeTexto
          rotulo="Nome do app"
          valor={rascunho.nome}
          aoMudar={(nome) => mudar({ nome })}
          ajuda={`${Array.from(rascunho.nome.trim()).length} de ${NOME_MAXIMO_DO_APP} caracteres. Aparece na barra lateral e na aba do navegador.`}
          erro={erroLocalDoNome ?? erroDoServidor ?? undefined}
          autoComplete="off"
        />
        <EscolhaDaMarca
          opcoes={dados.marcas}
          valor={rascunho.marca}
          nomeDoApp={rascunho.nome}
          aoMudar={(marca) => mudar({ marca })}
        />
        <div className={estilos.acoes}>
          <Botao type="submit" variante="primario" disabled={falta !== null || definir.pendente}>
            {definir.pendente ? "Salvando…" : "Salvar aparência"}
          </Botao>
          <Botao type="button" variante="secundario" disabled={!alterado || definir.pendente} onClick={cancelar}>
            Cancelar
          </Botao>
          {falta !== null && <p className={estilos.situacao}>{falta}</p>}
        </div>
      </form>
    );
  }

  return (
    <Cartao aria-label="Aparência">
      <div className={estilos.formulario}>
        <div className={estilos.acoes}>
          <Titulo nivel="secao">Aparência</Titulo>
          <MenuDeAcoes
            rotulo="Mais ações da aparência"
            ref={gatilhoDoMenu}
            itens={[
              {
                rotulo: "Restaurar a aparência padrão",
                aoEscolher: () => definirConfirmandoRestauracao(true),
              },
            ]}
          />
        </div>
        <p className={estilos.apoio}>
          Escolha a cor, a textura, o nome e a logo do app. Vale só para a sua conta, em qualquer
          aparelho. Layout, cores de entrada e saída e as cores das categorias não mudam.
        </p>
        {corpo}
      </div>
      <DialogoDeConfirmacao
        aberto={confirmandoRestauracao}
        titulo="Restaurar a aparência padrão?"
        descricao="A cor, a textura, o nome e a logo voltam ao padrão do Gastoba."
        rotuloDaAcao="Restaurar"
        pendente={restaurar.pendente}
        erro={restaurar.erro ? textoDoErro(restaurar.erro) : undefined}
        aoConfirmar={() => void restaurarPadrao()}
        aoCancelar={() => definirConfirmandoRestauracao(false)}
        devolverFocoPara={gatilhoDoMenu}
      />
    </Cartao>
  );
}
