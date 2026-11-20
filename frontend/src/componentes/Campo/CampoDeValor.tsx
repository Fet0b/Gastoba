import { type KeyboardEvent, type Ref, useId } from "react";
import { deMascara, interpretarDigitacao } from "../../dinheiro/dinheiro";
import estilos from "./CampoDeValor.module.css";
type Propriedades = {
    rotulo: string;
    /** Valor como string decimal da API ("25.90"); nunca negativo. */
    valor: string;
    /** Recebe o novo valor como string decimal da API. */
    aoMudar: (valor: string) => void;
    /** Mensagem de erro ligada ao campo. */
    erro?: string;
    ref?: Ref<HTMLInputElement>;
};
/** Texto da máscara ("25,90") a partir da string decimal ("25.90"). */
function mascaraDe(valor: string): string {
    return interpretarDigitacao(valor.replace(/\D/g, ""));
}
/**
 * Dígitos que ficam depois de uma edição qualquer do texto. O cursor pode estar
 * em qualquer lugar (clique, toque, colar, teclado virtual), então a edição é lida
 * pelo que mudou entre o texto anterior e o novo: o que foi inserido entra pela
 * direita e o que foi apagado sai pela direita; apagar todos os dígitos (seleção
 * total) recomeça do que foi inserido.
 */
function digitosDepoisDaEdicao(anterior: string, novo: string, cursor: number | null): string {
  const digitosAnteriores = anterior.replace(/\D/g, "").replace(/^0+/, "");
  let inicio = 0;
  const maximo = Math.min(anterior.length, novo.length);
  while (inicio < maximo && anterior[inicio] === novo[inicio]) inicio++;
  let fim = 0;
  // O cursor depois da edição marca onde terminou o que foi inserido; sem ele (ou se não
  // combinar) vale o maior trecho final igual, que é ambíguo com zeros repetidos.
  const aposCursor = cursor === null ? -1 : novo.length - cursor;
  if (aposCursor >= 0 && aposCursor <= maximo - inicio && anterior.endsWith(novo.slice(novo.length - aposCursor))) {
    fim = aposCursor;
  } else {
    while (fim < maximo - inicio && anterior[anterior.length - 1 - fim] === novo[novo.length - 1 - fim])
      fim++;
  }
  const inseridos = novo.slice(inicio, novo.length - fim).replace(/\D/g, "");
  const apagados = anterior.slice(inicio, anterior.length - fim).replace(/\D/g, "").length;
  const restantes = digitosAnteriores.length - apagados;
  return (restantes > 0 ? digitosAnteriores.slice(0, restantes) : "") + inseridos;
}

/**
 * Campo de dinheiro com máscara de centavos: cada dígito entra pela direita
 * ("2590" vira "25,90"), Backspace tira o último dígito, colar ignora o que não é
 * dígito e um dígito que passaria do limite do backend é recusado. Por fora o
 * valor é sempre a string decimal da API, sem ponto flutuante (Art. III).
 */
export function CampoDeValor({ rotulo, valor, aoMudar, erro, ref }: Propriedades) {
    const id = useId();
    const idErro = `${id}-erro`;
    const mascara = mascaraDe(valor);
    function aoTeclar(evento: KeyboardEvent<HTMLInputElement>): void {
        if (evento.key !== "Backspace" || evento.ctrlKey || evento.metaKey || evento.altKey)
            return;
        // O cursor fica sempre no fim: Backspace tira o último dígito, onde quer que
        // esteja o cursor; com tudo selecionado, zera.
        evento.preventDefault();
        const entrada = evento.currentTarget;
        const tudoSelecionado = entrada.selectionStart === 0 && entrada.selectionEnd === entrada.value.length;
        const digitos = tudoSelecionado ? "" : mascara.replace(/\D/g, "").replace(/^0+/, "").slice(0, -1);
        aoMudar(deMascara(interpretarDigitacao(digitos)));
    }
    return (<div className={estilos.campo}>
      <label htmlFor={id} className={estilos.rotulo}>
        {rotulo}
      </label>
      <div className={estilos.moldura}>
        <span className={estilos.moeda} aria-hidden="true">
          R$
        </span>
        <input ref={ref} id={id} className={`${estilos.entrada} valor`} value={mascara} onChange={(evento) => aoMudar(deMascara(interpretarDigitacao(digitosDepoisDaEdicao(mascara, evento.target.value, evento.target.selectionStart))))} onKeyDown={aoTeclar} inputMode="numeric" autoComplete="off" aria-invalid={erro ? true : undefined} aria-describedby={erro ? idErro : undefined}/>
      </div>
      {erro && (<p id={idErro} className={estilos.erro}>
          {erro}
        </p>)}
    </div>);
}
