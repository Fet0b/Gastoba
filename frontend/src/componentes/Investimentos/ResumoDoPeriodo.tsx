import { useMovimentosDeInvestimento } from "../../api/consultas";
import type { PontoDoHistorico } from "../../api/tipos";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import type { PontoDaEvolucao } from "../../investimentos/evolucao";
import { fluxoLiquido } from "../../investimentos/fluxos";
import { GradeDeIndicadores } from "../GradeDeIndicadores/GradeDeIndicadores";
import { Indicador } from "../Indicador/Indicador";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";

type Propriedades = {serie:readonly PontoDaEvolucao[];pontos:readonly PontoDoHistorico[];investimentoId:string;className?:string;compacto?:boolean;consulta?:ReturnType<typeof useMovimentosDeInvestimento>};
const comSinal = (valor:string) => `${paraCentavos(valor)>0n?"+":""}${formatar(valor)}`;
const tom = (valor:string|undefined) => valor===undefined?"neutro":paraCentavos(valor)<0n?"negativo":"positivo";

export function ResumoDoPeriodo(props:Propriedades) {
  return props.serie.length < 2 ? null : props.consulta ? <ResumoDosDados {...props} consulta={props.consulta} /> : <ResumoComMovimentos {...props} />;
}
function ResumoComMovimentos({serie,pontos,investimentoId,className,compacto=false}:Propriedades) {
  const primeiro=serie[0], ultimo=serie[serie.length-1];
  const movimentos=useMovimentosDeInvestimento(primeiro.data,ultimo.data);
  return <ResumoDosDados serie={serie} pontos={pontos} investimentoId={investimentoId} className={className} compacto={compacto} consulta={movimentos} />;
}
function ResumoDosDados({serie,pontos,investimentoId,className,compacto=false,consulta:movimentos}:Propriedades & {consulta:ReturnType<typeof useMovimentosDeInvestimento>}) {
  const primeiro=serie[0],ultimo=serie[serie.length-1];
  const variacao=deCentavos(paraCentavos(ultimo.saldo)-paraCentavos(primeiro.saldo));
  const aportes=movimentos.dados===undefined?undefined:fluxoLiquido(movimentos.dados,pontos,primeiro.data,ultimo.data,investimentoId||undefined);
  const rendimento=aportes===undefined?undefined:deCentavos(paraCentavos(variacao)-paraCentavos(aportes));
  return <div className={className}>
    {movimentos.erro!=null&&<EstadoDeErro mensagem="Não foi possível carregar os aportes do período." />}
    <GradeDeIndicadores colunas={compacto?2:3}>
      <Indicador rotulo={compacto?"Variação em 30 dias":"Variação"} valor={comSinal(variacao)} tom={tom(variacao)} />
      <Indicador rotulo="Aportes líquidos" valor={aportes===undefined?"—":comSinal(aportes)} tom={tom(aportes)} nota={movimentos.carregando?"Carregando aportes…":undefined} />
      {!compacto&&<Indicador rotulo="Rendimento" valor={rendimento===undefined?"—":comSinal(rendimento)} tom={tom(rendimento)} />}
    </GradeDeIndicadores>
  </div>;
}
