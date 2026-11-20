import { ErroDaApiCliente } from "../api/cliente";
import { useContas, useFaturas } from "../api/consultas";
import { CartaoComFaturas } from "../componentes/Faturas/CartaoComFaturas";
import { EstadoVazio } from "../componentes/EstadoVazio/EstadoVazio";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { useEstadoDoOlho } from "../componentes/Olho/useEstadoDoOlho";
import { Pagina } from "../componentes/Pagina/Pagina";
import { hojeLocal } from "../periodo/periodo";
import { Esqueleto } from "../componentes/Esqueleto/Esqueleto";
import estilos from "./Faturas.module.css";
import { ehSemResposta, MENSAGEM_SERVIDOR_FORA } from "./mensagens";

/**
 * Faturas: o que se deve em cada cartão, só leitura. Sem a importação bancária não há cartão
 * conectado, então a tela nem consulta a API. Nada daqui entra em saldo, metas nem totais.
 */
export function Faturas({ navegacao }: { navegacao: Navegacao }) {
  const [estadoDoOlho] = useEstadoDoOlho();

  return (
    <Pagina
      navegacao={navegacao}
      estadoDoOlho={estadoDoOlho}
      mensagem={null}
      aoDispensarMensagem={() => undefined}
      cabecalho={{titulo: "Faturas", subtitulo: "O que você deve em cada cartão."}}
    >
      <div className={estilos.conteudo}>
        {navegacao.importacaoBancaria === true ? (
          <FaturasDosCartoes navegacao={navegacao} />
        ) : (
          <SemCartoes navegacao={navegacao} />
        )}
      </div>
    </Pagina>
  );
}

function SemCartoes({ navegacao }: { navegacao: Navegacao }) {
  return (
    <EstadoVazio
      icone="faturas"
      titulo="Nenhum cartão de crédito conectado"
        descricao="Conecte um cartão para acompanhar as compras e o fechamento das faturas."
      acao={{ rotulo: "Ver contas", aoClicar: () => navegacao.aoIrPara("contas") }}
    />
  );
}

function FaturasDosCartoes({ navegacao }: { navegacao: Navegacao }) {
  const hoje = hojeLocal();
  const faturas = useFaturas(hoje);
  const contas = useContas();
  const finais = new Map(contas.dados?.map((conta) => [conta.id, conta.final_do_numero]));

  if (faturas.erro) {
    const mensagem = ehSemResposta(faturas.erro)
      ? MENSAGEM_SERVIDOR_FORA
      : (faturas.erro as ErroDaApiCliente).mensagem;
    return (
      <p className={estilos.erro} role="alert">
        {mensagem}
      </p>
    );
  }
  if (!faturas.dados) return <Esqueleto rotulo="Carregando faturas…" />;
  if (faturas.dados.cartoes.length === 0) return <SemCartoes navegacao={navegacao} />;
  return (
    <>
      {faturas.dados.cartoes.map((cartao) => (
        <CartaoComFaturas key={cartao.conta_id} cartao={cartao} hoje={hoje} finalDoNumero={finais.get(cartao.conta_id)} />
      ))}
    </>
  );
}
