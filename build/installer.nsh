; Adiciona o verbo extra "Edit with Paperditor" ao menu de contexto (botão direito) do
; Windows para arquivos .md/.markdown, além do verbo "open" padrão que o electron-builder
; já registra sozinho a partir de "fileAssociations" no electron-builder.json5.
;
; O verbo "open" (duplo clique / associação padrão) abre em modo Reading (comportamento
; padrão do app quando não recebe a flag --edit — ver electron/main.ts, getLaunchIntent).
; Este verbo "edit" passa --edit, forçando abertura em modo Editor (aba Home).
;
; APP_ASSOCIATE_ADDVERB/REMOVEVERB vêm de FileAssociation.nsh (incluído automaticamente
; pelo electron-builder por já existir "fileAssociations" na config). A classe de arquivo
; "Markdown Document" abaixo precisa bater com o campo "name" usado nas entradas .md e
; .markdown de "fileAssociations" no electron-builder.json5 — se esse "name" mudar lá,
; precisa mudar aqui também.
;
; $appExe já é definido pelo próprio installSection.nsh do electron-builder antes de
; customInstall rodar.

!macro customInstall
  !insertmacro APP_ASSOCIATE_ADDVERB "Markdown Document" "edit" "Edit with Paperditor" '"$appExe" --edit "%1"'
!macroend

!macro customUnInstall
  !insertmacro APP_ASSOCIATE_REMOVEVERB "Markdown Document" "edit"
!macroend
