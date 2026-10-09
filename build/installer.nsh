!include LogicLib.nsh
!include WinMessages.nsh
; Personalización del instalador NSIS de MasterWar (se inyecta vía nsis.include).
; Páginas: Bienvenida (con arte) -> Términos y políticas (licencia) -> Ubicación -> Progreso (el plugin Nsis7z ya muestra "NN% (X / Y MB)") -> Fin (Iniciar MasterWar)

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Bienvenido a MasterWar"
  !define MUI_WELCOMEPAGE_TEXT "Este asistente instalará MasterWar, el juego de estrategia medieval en tiempo real, en tu equipo.$\r$\n$\r$\nMasterWar fue creado completamente con inteligencia artificial: voces, imágenes, modelos 3D y efectos de sonido. Ningún elemento ha sido tomado de otro videojuego.$\r$\n$\r$\nPulsa Siguiente para continuar."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_TITLE "MasterWar se instaló correctamente"
  !define MUI_FINISHPAGE_TEXT "El juego está listo. Tus ajustes y partidas se guardan en tu perfil de usuario y se conservan al actualizar o desinstalar.$\r$\n$\r$\nPulsa Finalizar para cerrar el asistente."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !define MUI_FINISHPAGE_RUN_TEXT "Iniciar MasterWar"
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnInstall
  DetailPrint "Tus ajustes y partidas guardadas (carpeta de datos de MasterWar en tu perfil) NO se eliminan."
!macroend

; Instalación siempre por usuario (sin admin ni UAC): el launcher y el updater escriben en el perfil del usuario.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
