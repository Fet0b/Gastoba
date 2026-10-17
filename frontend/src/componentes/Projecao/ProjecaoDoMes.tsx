import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import type { Periodo } from "../../periodo/periodo";
import { MINIMO_DE_DIAS, projetarGastoDoMes, type EntradaDaProjecao } from "../../projecao/projecao";
import { Icone } from "../Icone/Icone";
import estilos from "./ProjecaoDoMes.module.css";

type Propriedades = {
  periodo: Periodo;
  /** Os gastos do mês, sem filtro; o módulo da projeção separa o que tem data até hoje. */
  gastos: EntradaDaProjecao["gastos"] | undefined;
  /** A renda do mês, string decimal. */
  renda: string;
  /** "AAAA-MM-DD"; a página passa `hojeLocal()`. */
  hoje: string;
  carregando?: boolean;
  erro?: boolean;
};

type Situacao =
  | "carregando"
  | "erro"
  | "futuro"
  | "fechou"
  | "poucos_dias"
  | "sem_renda"
  | "cabe"
  | "passa";

const NOTA = "Estimativa simples, pelo ritmo dos gastos até hoje";

/** A frase da situação do mês: quanto se espera gastar até o fim e se isso cabe na renda. */
export function ProjecaoDoMes({ periodo, gastos, renda, hoje, carregando, erro }: Propriedades) {
  let situacao: Situacao;
  let titulo: string | null = null;
  let frase: string;
  let icone: "ok" | "alerta" | null = null;
  let observacao: string | null = null;

  if (erro) {
    situacao = "erro";
    frase = "Não foi possível calcular";
  } else if (gastos === undefined || carregando) {
    situacao = "carregando";
    frase = "Calculando…";
  } else {
    const projecao = projetarGastoDoMes({ gastos, periodo, hoje });
    if (projecao.tipo === "futuro") {
      situacao = "futuro";
      frase = "O mês ainda não começou";
    } else if (projecao.tipo === "encerrado") {
      situacao = "fechou";
      frase = `Fechou em ${formatar(projecao.gasto)}`;
    } else if (projecao.tipo === "poucos_dias") {
      situacao = "poucos_dias";
      frase = `Poucos dias de dados: a projeção aparece a partir do dia ${MINIMO_DE_DIAS}. Até agora: ${formatar(projecao.gasto)}`;
    } else {
      titulo = formatar(projecao.estimativa);
      if (paraCentavos(projecao.gasto) === 0n) observacao = "Nenhum gasto até agora";
      const estimativa = paraCentavos(projecao.estimativa);
      const rendaCentavos = paraCentavos(renda);
      if (rendaCentavos <= 0n) {
        situacao = "sem_renda";
        frase = "Sem renda registrada neste mês";
      } else if (estimativa <= rendaCentavos) {
        situacao = "cabe";
        icone = "ok";
        frase = `Cabe na renda · sobram ${formatar(deCentavos(rendaCentavos - estimativa))}`;
      } else {
        situacao = "passa";
        icone = "alerta";
        frase = `Passa da renda em ${formatar(deCentavos(estimativa - rendaCentavos))}`;
      }
    }
  }

  return (
    <div className={estilos.projecao} data-situacao={situacao}>
      <span className={estilos.rotulo}>Projeção do mês</span>
      {titulo !== null && <span className={estilos.valor}>{titulo}</span>}
      {observacao !== null && <span className={estilos.observacao}>{observacao}</span>}
      <span className={estilos.frase}>
        {icone !== null && <Icone nome={icone} tamanho={16} />}
        <span>{frase}</span>
      </span>
      {situacao !== "futuro" && situacao !== "carregando" && situacao !== "erro" && (
        <span className={estilos.nota}>{NOTA}</span>
      )}
    </div>
  );
}
