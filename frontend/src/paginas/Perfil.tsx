import { useEffect, useId, useState } from "react";

import { ErroDaApiCliente } from "../api/cliente";
import { useChavesDeApi, useRevogarChaveDeApi } from "../api/consultas";
import type { ChaveDeApi } from "../api/tipos";
import type { MensagemDoAviso } from "../componentes/Aviso/Aviso";
import { Cartao } from "../componentes/Cartao/Cartao";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { Pagina } from "../componentes/Pagina/Pagina";
import { FormularioDeChave } from "../componentes/Chaves/FormularioDeChave";
import { ListaDeChaves } from "../componentes/Chaves/ListaDeChaves";
import { SegredoDaChave } from "../componentes/Chaves/SegredoDaChave";
import { useEstadoDoOlho } from "../componentes/Olho/useEstadoDoOlho";
import estilos from "./Perfil.module.css";
import { ehSemResposta, MENSAGEM_SERVIDOR_FORA } from "./mensagens";

function textoDoErro(erro: unknown): string {
  return ehSemResposta(erro) ? MENSAGEM_SERVIDOR_FORA : (erro as ErroDaApiCliente).mensagem;
}

/** A chave recém-criada cujo segredo está na tela. */
type ChaveComSegredo = { nome: string; segredo: string };

/**
 * Perfil: o nome da pessoa, "Sair" e as chaves de API (o formulário de criação, a lista das
 * chaves ativas com a revogação (confirmada na própria linha) e o diálogo com o segredo da
 * chave recém-criada, que só existe no estado enquanto o diálogo está aberto).
 */
export function Perfil({ navegacao }: { navegacao: Navegacao }) {
  const chaves = useChavesDeApi();
  const revogar = useRevogarChaveDeApi();
  const [criada, definirCriada] = useState<ChaveComSegredo | null>(null);
  const [mensagem, definirMensagem] = useState<MensagemDoAviso | null>(null);
  const [estadoDoOlho, sinalizarOlho] = useEstadoDoOlho();
  const idTitulo = useId();

  // Cada mensagem é um objeto novo, para o Aviso anunciar mesmo texto repetido.
  function avisar(tipo: MensagemDoAviso["tipo"], texto: string): void {
    definirMensagem({ tipo, texto });
  }

  function avisarErro(erro: unknown): void {
    sinalizarOlho("erro");
    avisar("erro", textoDoErro(erro));
  }

  // Só quando chega um erro novo.
  useEffect(() => {
    if (chaves.erro) avisarErro(chaves.erro);
  }, [chaves.erro]);
  useEffect(() => {
    if (revogar.erro) avisarErro(revogar.erro);
  }, [revogar.erro]);

  async function revogarChave(chave: ChaveDeApi): Promise<boolean> {
    const revogada = await revogar.executar(chave.id);
    if (!revogada) return false;
    avisar("confirmacao", "Chave revogada.");
    return true;
  }

  return (
    <Pagina
      navegacao={navegacao}
      estadoDoOlho={estadoDoOlho}
      mensagem={mensagem}
      aoDispensarMensagem={() => definirMensagem(null)}
    >
      <div className={estilos.conteudo}>
        <div className={estilos.introducao}>
          <h2 className={estilos.titulo}>Perfil</h2>
          <Cartao variante="destaque" className={estilos.identidade}>
            <div className={estilos.pessoa} role="group" aria-label="Sua conta">
              <span className="visualmente-oculto">Conectado como</span>
              <span className={estilos.nomeDaPessoa}>{navegacao.nomeDaPessoa}</span>
              <button type="button" className={estilos.sair} onClick={navegacao.aoSair}>
                Sair
              </button>
            </div>
          </Cartao>
          <h2 id={idTitulo} className={estilos.titulo}>
            Chaves de API
          </h2>
          <p className={estilos.texto}>
            Uma chave deixa um script ou outro programa usar o Gastoba em seu nome, sem a sua
            senha. Revogue a que não for mais usada.
          </p>
        </div>

        <Cartao className={estilos.colunaDoFormulario} aria-label="Criar chave de API">
          <FormularioDeChave
            aoCriar={({ nome, segredo }) => {
              sinalizarOlho("confirmando");
              definirCriada({ nome, segredo });
            }}
            aoFalhar={(erro) => {
              sinalizarOlho("erro");
              if (ehSemResposta(erro)) avisar("erro", MENSAGEM_SERVIDOR_FORA);
            }}
          />
        </Cartao>

        <Cartao className={estilos.colunaDaLista} aria-label="Suas chaves de API">
          <ListaDeChaves
            chaves={chaves.dados}
            carregando={chaves.carregando}
            aoRevogar={revogarChave}
          />
        </Cartao>
      </div>

      {criada && (
        <SegredoDaChave
          nome={criada.nome}
          segredo={criada.segredo}
          aoFechar={() => definirCriada(null)}
        />
      )}
    </Pagina>
  );
}
