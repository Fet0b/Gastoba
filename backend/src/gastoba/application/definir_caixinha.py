import json
from datetime import date
from uuid import UUID, uuid4

from gastoba.domain.caixinha import TIPO_DA_CAIXINHA
from gastoba.domain.conta import TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ContaNaoEncontrada, TransacaoImportadaInvalida
from gastoba.domain.portas import InvestimentoExterno, UnidadeDeTrabalho


class DefinirCaixinha:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self, usuario_id: UUID, conta_id: UUID, saldo_remunerado: Dinheiro, data_do_saldo: date
    ):
        with self._unidade_de_trabalho as uow:
            conta = uow.contas.obter(usuario_id, conta_id)
            if conta is None:
                raise ContaNaoEncontrada("Conta não encontrada.")
            if not conta.saldo_e_do_banco or saldo_remunerado.centavos < 0:
                raise TransacaoImportadaInvalida(
                    "Confirme uma conta bancária e saldo de investimentos não negativo."
                )
            anterior = next(
                (
                    i
                    for i in uow.investimentos.listar_posicoes(usuario_id)
                    if i.conta_remunerada_id == conta.id
                ),
                None,
            )
            id_externo = anterior.id_externo if anterior else str(uuid4())
            if anterior and anterior.atualizado_em and anterior.atualizado_em > data_do_saldo:
                raise TransacaoImportadaInvalida(
                    "O saldo informado é anterior ao último saldo observado."
                )
            uow.contas.atualizar_do_banco(
                conta.id,
                conta.saldo,
                TipoDaConta.REMUNERADA,
                conta.nome_no_banco,
                conta.final_do_numero,
            )
            uow.investimentos.salvar_posicao(
                usuario_id,
                InvestimentoExterno(
                    id_externo,
                    f"Conta investimentos ({conta.rotulo})",
                    TIPO_DA_CAIXINHA,
                    None,
                    saldo_remunerado,
                    json.dumps({"fonte": "extrato_confirmado"}),
                    conta_remunerada_id=conta.id,
                ),
                data_do_saldo,
            )
            resultado = next(
                i
                for i in uow.investimentos.listar_posicoes(usuario_id)
                if i.conta_remunerada_id == conta.id
            )
            uow.commit()
            return resultado
