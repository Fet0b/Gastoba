import { type FormEvent, useEffect, useRef, useState } from "react";

import { ErroDaApiCliente } from "../../api/cliente";
import { useCriarConta } from "../../api/consultas";
import type { Conta } from "../../api/tipos";
import { deMascara, interpretarDigitacao } from "../../dinheiro/dinheiro";
import { Botao } from "../Botao/Botao";
import { Caixa } from "../Campo/Caixa";
import { CampoDeTexto } from "../Campo/CampoDeTexto";
import { CampoDeValor } from "../Campo/CampoDeValor";
import estilos from "./Contas.module.css";

type Propriedades = {
  aoCriar: (conta: Conta) => void;
  aoCancelar: () => void;
  /** Toda falha ao criar (o painel pisca o olho e avisa quando não há resposta). */
  aoFalhar: (erro: unknown) => void;
};

type ErrosDoFormulario = { nome?: string; saldo?: string; geral?: string };

/**
 * Onde mostrar o erro da API: junto ao nome, junto ao saldo ou no formulário.
 * Sem resposta do servidor (ou erro desconhecido) fica com o aviso do painel.
 */
function errosDoFormulario(erro: unknown): ErrosDoFormulario {
  if (!(erro instanceof ErroDaApiCliente) || erro.codigo === "sem_resposta") return {};
  switch (erro.codigo) {
    case "nome_invalido":
    case "conta_ja_existe":
      return { nome: erro.mensagem };
    case "valor_invalido":
      return { saldo: erro.mensagem };
    case "requisicao_invalida": {
      const erros: ErrosDoFormulario = {};
      for (const { campo, mensagem } of erro.detalhes ?? []) {
        if (campo === "body.nome") erros.nome ??= mensagem;
        else if (campo === "body.saldo_inicial") erros.saldo ??= mensagem;
      }
      return erros.nome || erros.saldo ? erros : { geral: erro.mensagem };
    }
    default:
      return { geral: erro.mensagem };
  }
}

/**
 * Formulário de nova conta, aberto dentro da coluna de contas: nome, saldo
 * inicial com máscara de dígitos e "Saldo devedor", que torna o saldo negativo.
 */
export function FormularioDeConta({ aoCriar, aoCancelar, aoFalhar }: Propriedades) {
  const [nome, definirNome] = useState("");
  const [saldo, definirSaldo] = useState(() => interpretarDigitacao(""));
  const [devedor, definirDevedor] = useState(false);
  const criar = useCriarConta();
  const campoNome = useRef<HTMLInputElement>(null);
  const campoSaldo = useRef<HTMLInputElement>(null);

  const erros = errosDoFormulario(criar.erro);

  // A função mais recente numa ref: cada erro novo avisa uma vez só.
  const avisarFalha = useRef(aoFalhar);
  useEffect(() => {
    avisarFalha.current = aoFalhar;
  });
  useEffect(() => {
    if (criar.erro === null) return;
    avisarFalha.current(criar.erro);
    // O foco vai ao campo com erro, para a mensagem ligada a ele ser lida.
    const { nome: erroNoNome, saldo: erroNoSaldo } = errosDoFormulario(criar.erro);
    if (erroNoNome) campoNome.current?.focus();
    else if (erroNoSaldo) campoSaldo.current?.focus();
  }, [criar.erro]);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    const valor = deMascara(saldo);
    const saldo_inicial = devedor && valor !== "0.00" ? `-${valor}` : valor;
    const conta = await criar.executar({ nome, saldo_inicial });
    if (conta) aoCriar(conta);
  }


  return (
    <form className={estilos.formulario} onSubmit={enviar} aria-label="Nova conta" noValidate>
      <CampoDeTexto
        ref={campoNome}
        rotulo="Nome"
        valor={nome}
        aoMudar={definirNome}
        autoComplete="off"
        autoFocus
        erro={erros.nome}
      />

      <CampoDeValor
        ref={campoSaldo}
        rotulo="Saldo inicial"
        valor={deMascara(saldo)}
        aoMudar={(valor) => definirSaldo(interpretarDigitacao(valor))}
        erro={erros.saldo}
      />

      <Caixa
        rotulo="Saldo devedor"
        ajuda="A conta começa devendo esse valor, como um cartão de crédito."
        marcada={devedor}
        aoMudar={definirDevedor}
      />

      {/* Sem campo ao qual ligar a mensagem nem foco para levá-la: o alerta a anuncia. */}
      {erros.geral && (
        <p role="alert" className={estilos.erroDoCampo}>
          {erros.geral}
        </p>
      )}

      <div className={estilos.acoes}>
        <Botao type="submit" variante="primario" disabled={criar.pendente}>
          Criar conta
        </Botao>
        <Botao variante="secundario" onClick={aoCancelar}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}
