import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { useFatura } from "../../api/consultas";
import { formatar } from "../../dinheiro/dinheiro";
import { dataParaExibicao } from "../../periodo/periodo";
import { ListaDeCompras } from "./ListaDeCompras";
import estilos from "./Faturas.module.css";

/** Busca e mostra as compras e os pagamentos de uma fatura; só é montado com a fatura aberta. */
export function DetalheDaFatura({ id, hoje }: { id: string; hoje: string }) {
  const fatura = useFatura(id, hoje);
  if (fatura.erro) {
    const mensagem =
      fatura.erro instanceof ErroDaApiCliente && fatura.erro.codigo !== "sem_resposta"
        ? fatura.erro.mensagem
        : MENSAGEM_SEM_RESPOSTA;
    return (
      <p className={estilos.erro} role="alert">
        {mensagem}
      </p>
    );
  }
  if (!fatura.dados) return <p className={estilos.vazio}>Carregando compras…</p>;
  return (
    <div className={estilos.detalhe}>
      <ListaDeCompras compras={fatura.dados.compras} />
      {fatura.dados.pagamentos.length > 0 && (
        <ul className={estilos.pagamentos} aria-label="Pagamentos da fatura">
          {fatura.dados.pagamentos.map((pagamento) => (
            <li key={`${pagamento.data}-${pagamento.valor}`}>
              <span>Pagamento em {dataParaExibicao(pagamento.data)}</span>
              <span>{formatar(pagamento.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
