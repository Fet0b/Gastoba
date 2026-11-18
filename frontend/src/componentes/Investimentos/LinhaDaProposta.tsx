import type { PropostaDeCasamento } from "../../api/tipos";
import { formatar, paraCentavos, somar } from "../../dinheiro/dinheiro";
import { diferencaComSinal, rotuloDaProposta, rotuloDaSituacao, textosDosEfeitos } from "../../investimentos/revisaoDaBolsa";
import { Badge } from "../Badge/Badge";
import { Caixa } from "../Campo/Caixa";
import { Dica } from "../Dica/Dica";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { Metadados } from "../Metadados/Metadados";
import { Recolhivel } from "../Recolhivel/Recolhivel";
import { Tabela } from "../Tabela/Tabela";
import estilos from "./RevisaoDaBolsa.module.css";

const diaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const dataCompleta = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

type Props = {
  proposta: PropostaDeCasamento;
  selecionada: boolean;
  aoSelecionar: (marcada: boolean) => void;
  aoLigarSo: () => void;
  ocupada: boolean;
};

/** Uma proposta exata: seleção, valor com sinal, situação de hoje e a evidência sob demanda. */
export function LinhaDaProposta({ proposta: p, selecionada, aoSelecionar, aoLigarSo, ocupada }: Props) {
  const rotulo = rotuloDaProposta(p);
  const saida = p.tipo === "compra_na_bolsa";
  const totalBruto = somar(p.bruto.map(t => t.valor));
  const valor = saida ? `-${totalBruto}` : totalBruto;
  const totalTaxas = somar(["0.00", ...p.taxas.map(t => t.valor)]);
  const totalOperacoes = somar(p.operacoes.map(o => o.valor_bruto));
  const custos = somar(["0.00", ...p.operacoes.map(o => o.custos)]);
  const iguais = paraCentavos(p.diferenca) === 0n;
  const diferencaDeCusto = paraCentavos(p.diferenca_de_custo) !== 0n;
  const abs = (v: string) => (paraCentavos(v) < 0n ? v.replace("-", "") : v);
  return <li className={estilos.linha} aria-label={rotulo}>
    <div className={estilos.topo}>
      <Caixa
        className={estilos.nome}
        rotulo={rotulo}
        aria-label={`Selecionar ${rotulo.replace(/ \([^)]*\)/g, "").replace(/^./, c => c.toLowerCase())} de ${dataCompleta(p.data_do_pregao)}, ${formatar(valor).replace(/\u00a0/g, " ")}`}
        marcada={selecionada}
        aoMudar={aoSelecionar}
        disabled={ocupada}
      />
      <span className={estilos.valor} data-sentido={saida ? "saida" : "entrada"}>{saida ? formatar(valor) : `+${formatar(valor)}`}</span>
      <MenuDeAcoes rotulo={`Mais ações de ${rotulo}`} itens={[{ rotulo: "Ligar só esta", desabilitado: ocupada, aoEscolher: aoLigarSo }]} />
    </div>
    <Metadados>
      {iguais && <Badge tom="positivo">Valores iguais</Badge>}
      {diferencaDeCusto && <span className={estilos.selo}><Badge tom="atencao">Taxas diferem em {formatar(abs(p.diferenca_de_custo))}</Badge><Dica assunto="a diferença de taxas">A corretora informa um custo diferente do que saiu da conta. A ligação não altera o custo.</Dica></span>}
      <span>Liquidação em {diaMes(p.bruto[0].data)}</span>
      <span>{rotuloDaSituacao(p.bruto[0].situacao)}</span>
    </Metadados>
    <Recolhivel resumo="Ver evidência">
      <Tabela
        legenda={`Evidência de ${rotulo}`}
        colunas={[{ chave: "item", titulo: "" }, { chave: "corretora", titulo: "Corretora", numerica: true }, { chave: "conta", titulo: "Conta", numerica: true }, { chave: "diferenca", titulo: "Diferença", numerica: true }]}
        linhas={[
          { item: "Data", corretora: `pregão ${dataCompleta(p.data_do_pregao)}`, conta: `liquidação ${dataCompleta(p.bruto[0].data)}`, diferenca: "" },
          { item: "Valor bruto", corretora: formatar(totalOperacoes), conta: formatar(totalBruto), diferenca: diferencaComSinal(p.diferenca) },
          { item: "Taxas", corretora: formatar(custos), conta: `${formatar(totalTaxas)}${p.taxas.length ? ` (${plural(p.taxas.length, "débito", "débitos")})` : ""}`, diferenca: diferencaComSinal(p.diferenca_de_custo) },
        ]}
      />
      <p className={estilos.apoio}>O que muda ao ligar:</p>
      <ul className={estilos.efeitos}>{textosDosEfeitos(p).map(t => <li key={t}>{t}</li>)}</ul>
    </Recolhivel>
  </li>;
}
