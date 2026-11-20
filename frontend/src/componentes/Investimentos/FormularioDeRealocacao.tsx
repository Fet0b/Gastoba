import { normalizarNomeDaInstituicao } from "../../texto/nomeDaInstituicao";
import { CampoDeValor } from "../Campo/CampoDeValor";
import { CampoDeTexto } from "../Campo/CampoDeTexto";
import { CampoDeData } from "../Campo/CampoDeData";
import { GrupoDeOpcoes } from "../Campo/GrupoDeOpcoes";
import { Seletor } from "../Campo/Seletor";
import { Dialogo } from "../Dialogo/Dialogo";
import { useEffect, useId, useState } from "react";

import { useDestinacoesCadastradas, useRealocar } from "../../api/consultas";
import { invalidar } from "../../api/useConsulta";
import type { Investimento } from "../../api/tipos";
import { ErroDaApiCliente } from "../../api/cliente";
import { formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { lerPercentual } from "../../investimentos/destinacoes";
import { hojeLocal } from "../../periodo/periodo";
import { normalizarTag, validarTag } from "../../tags/tags";
import { rotuloDeExibicao } from "../../texto/rotulo";
import { MENSAGEM_SERVIDOR_FORA, ehSemResposta } from "../../paginas/mensagens";
import { Botao } from "../Botao/Botao";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import estilos from "./Investimentos.module.css";

type Propriedades = {
  emDialogo?: boolean;
  investimento: Investimento;
  aoRealocar: () => void;
  aoCancelar: () => void;
  aoFalhar: (erro: unknown) => void;
};

/**
 * Move parte do principal de uma destinação para outra, com data, informando o valor em reais ou
 * a porcentagem do principal da origem. O total do investimento não muda; a API confere o resto
 * (principal suficiente) e a mensagem dela aparece aqui.
 *
 * Numa posição por fração, move a fração entre caixinhas: o destino é escolhido entre as
 * caixinhas que já existem (sem pré-seleção), porque a API recusa caixinha nova.
 */
export function FormularioDeRealocacao({ emDialogo = false, investimento, aoRealocar, aoCancelar, aoFalhar }: Propriedades) {
  const id = useId();
  const realocar = useRealocar();
  const porFracao = investimento.alocacao_por_fracao === true;
  const catalogo = useDestinacoesCadastradas();
  const origens = investimento.destinacoes.filter((d) => d.tag !== null && paraCentavos(d.principal) > 0n);
  const [origem, definirOrigem] = useState(origens[0]?.tag ?? "");
  const [destino, definirDestino] = useState("");
  const [modo, definirModo] = useState<"percentual" | "valor">("percentual");
  const [quantia, definirQuantia] = useState("");
  const [valorMonetario, definirValorMonetario] = useState("0.00");
  const [data, definirData] = useState(hojeLocal);

  const principal = origens.find((d) => d.tag === origem)?.principal;
  const tagDoDestino = normalizarTag(destino);
  const caixinhas = porFracao
    ? (catalogo.dados ?? []).map((item) => item.nome).filter((nome) => nome !== origem).sort((a, b) => a.localeCompare(b, "pt-BR"))
    : [];
  const motivos: string[] = [];
  if (origens.length === 0) {
    motivos.push(porFracao ? "Ainda não há caixinha com valor para realocar." : "Ainda não há destinação com principal para realocar.");
  }
  if (porFracao) {
    if (tagDoDestino === "") motivos.push("Escolha a caixinha de destino.");
  } else {
    const erroDaTag = validarTag(tagDoDestino);
    if (erroDaTag !== null) motivos.push(erroDaTag);
    else if (tagDoDestino === origem) motivos.push("O destino deve ser diferente da origem.");
  }
  if (modo === "percentual" && lerPercentual(quantia) === null) {
    motivos.push("Informe um percentual inteiro de 1 a 100.");
  }
  if (modo === "valor" && paraCentavos(valorMonetario) <= 0n) {
    motivos.push("Informe o valor em reais, ex.: 150,00.");
  }
  const erro =
    realocar.erro === null || realocar.erro === undefined
      ? null
      : ehSemResposta(realocar.erro)
        ? MENSAGEM_SERVIDOR_FORA
        : (realocar.erro as ErroDaApiCliente).mensagem;

  async function enviar(evento: React.FormEvent): Promise<void> {
    evento.preventDefault();
    if (motivos.length > 0 || realocar.pendente) return;
    const dados =
      modo === "percentual"
        ? { origem, destino: tagDoDestino, data, percentual: lerPercentual(quantia) as number }
        : { origem, destino: tagDoDestino, data, valor: valorMonetario };
    const feita = await realocar.executar({ investimentoId: investimento.id, dados });
    if (feita) aoRealocar();
  }
  // Falha de rede: a tela dona avisa (o erro da API aparece aqui, junto ao formulário).
  useEffect(() => {
    if (realocar.erro !== null && realocar.erro !== undefined && ehSemResposta(realocar.erro)) {
      aoFalhar(realocar.erro);
    }
  }, [realocar.erro]);

  const acoes = (<div className={estilos.acoes}><Botao variante="secundario" onClick={aoCancelar}>
          Cancelar
        </Botao><Botao variante="primario" type="submit" form={`${id}-formulario`} disabled={motivos.length > 0 || realocar.pendente} aria-describedby={motivos.length>0?`${id}-motivos`:undefined}>
          {realocar.pendente ? "Realocando…" : "Realocar"}
        </Botao></div>);
  const formulario = (
    <form id={`${id}-formulario`} className={estilos.formulario} onSubmit={(evento) => void enviar(evento)} aria-label={`Realocar em ${investimento.nome}`}>
      <p className={estilos.apoio}>{porFracao ? "Mova parte de uma caixinha para outra sem alterar o saldo do investimento." : "Mova parte do principal entre destinações sem alterar o saldo do investimento."}</p>
      <Seletor rotulo="Tirar de" valor={origem} aoMudar={valor => { definirOrigem(valor); if (porFracao && valor === destino) definirDestino(""); }} opcoes={origens.map(d=>({valor:d.tag??"",rotulo:`${rotuloDeExibicao(d.tag ?? "")} (principal ${formatar(d.principal)})`}))} />
      {porFracao ? (
        <Seletor rotulo="Levar para a caixinha" valor={destino} aoMudar={definirDestino} vazio="Escolha a caixinha" opcoes={caixinhas.map(tag => ({ valor: tag, rotulo: rotuloDeExibicao(tag) }))} />
      ) : (
        <>
          <CampoDeTexto rotulo="Levar para (tag)" valor={destino} aoMudar={valor=>definirDestino(valor.toLowerCase())} list={`${id}-tags`} placeholder="ex.: casa nova" autoCapitalize="none" />
          <datalist id={`${id}-tags`}>{investimento.destinacoes.flatMap(d=>d.tag===null?[]:[<option key={d.tag} value={d.tag}/>])}</datalist>
        </>
      )}
      {porFracao && Boolean(catalogo.erro) && <EstadoDeErro mensagem="Não foi possível carregar as caixinhas cadastradas." aoTentarDeNovo={() => invalidar("destinacoes-cadastradas")} />}
      <GrupoDeOpcoes legenda="Quanto mover" valor={modo} aoMudar={valor=>definirModo(valor as "percentual"|"valor")} opcoes={[{valor:"percentual",titulo:"Porcentagem do principal"},{valor:"valor",titulo:"Valor em reais"}]} />
      {modo === "percentual" ? <CampoDeTexto rotulo="Percentual (1 a 100)" inputMode="numeric" valor={quantia} aoMudar={definirQuantia} /> : <CampoDeValor rotulo="Valor (R$)" valor={valorMonetario} aoMudar={definirValorMonetario} />}
      {principal !== undefined && modo === "valor" && (
        <span className={estilos.apoio}>Principal da origem: {formatar(principal)}</span>
      )}
      <CampoDeData rotulo="Data" valor={data} aoMudar={definirData} />
      {erro && (
        <p role="alert" className={estilos.erro}>
          {erro}
        </p>
      )}
      {motivos.length > 0 && (
        <ul id={`${id}-motivos`} className={estilos.motivos}>
          {motivos.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {!emDialogo && acoes}
    </form>
  );
  return emDialogo ? <Dialogo aberto titulo={`Realocar ${normalizarNomeDaInstituicao(investimento.nome)}`} aoFechar={aoCancelar} rodape={acoes}>{formulario}</Dialogo> : formulario;
}
