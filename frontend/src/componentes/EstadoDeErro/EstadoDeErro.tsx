import { Botao } from "../Botao/Botao";
import { Icone } from "../Icone/Icone";
import estilos from "./EstadoDeErro.module.css";
export function EstadoDeErro({ titulo = "Não foi possível carregar", mensagem, aoTentarDeNovo, className }: {
    titulo?: string;
    mensagem: string;
    aoTentarDeNovo?: () => void;
    className?: string;
}) { return <div className={[estilos.erro, className].filter(Boolean).join(" ")} role="alert"><Icone nome="alerta"/><strong>{titulo}</strong><p>{mensagem}</p>{aoTentarDeNovo && <Botao variante="secundario" onClick={aoTentarDeNovo}>Tentar novamente</Botao>}</div>; }
