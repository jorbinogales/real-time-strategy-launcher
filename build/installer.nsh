!include LogicLib.nsh
!include WinMessages.nsh
; Personalización del instalador NSIS de MasterWar (se inyecta vía nsis.include).
; Páginas: Bienvenida (con arte) -> Términos y políticas (licencia) -> Ubicación -> Progreso con "NN %" -> Fin (Iniciar MasterWar)

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

; ---- Juego (build/content.7z) -> $INSTDIR\resources\content, con porcentaje real.
; Nsis7z::ExtractWithCallback llama a la funcion DESDE el hilo de instalacion (seguro); un temporizador en el hilo de UI
; ejecutando codigo NSIS a la vez que la extraccion tumba el instalador (probado), asi que no se usa.
!ifndef BUILD_UNINSTALLER
!include /NONFATAL "content-size.nsh"
!endif

!macro customInit
  !ifndef BUILD_UNINSTALLER
  !ifdef CONTENT_SIZE_KB
    SectionGetSize 0 $0
    IntOp $0 $0 + ${CONTENT_SIZE_KB}
    SectionSetSize 0 $0
  !endif
  !endif
!macroend

!macro customInstall
  GetDlgItem $R6 $HWNDPARENT 1038
  SendMessage $R6 ${WM_SETTEXT} 0 "STR:Copiando archivos del juego... 0 %"
  SetOutPath "$INSTDIR\resources\content"
  SetCompress off
  File "/oname=$PLUGINSDIR\content.7z" "${BUILD_RESOURCES_DIR}\content.7z"
  GetFunctionAddress $R9 ContentProgress
  Nsis7z::ExtractWithCallback "$PLUGINSDIR\content.7z" $R9
  Delete "$PLUGINSDIR\content.7z"
  SetOutPath "$INSTDIR"
  SendMessage $R6 ${WM_SETTEXT} 0 "STR:Copiando archivos del juego... 100 %"
!macroend

!ifndef BUILD_UNINSTALLER
Function ContentProgress
  Pop $R7                              ; bytes extraidos (int64)
  Pop $R8                              ; bytes totales
  System::Int64Op $R7 * 100
  Pop $R7
  System::Int64Op $R7 / $R8
  Pop $R7
  GetDlgItem $R6 $HWNDPARENT 1038
  SendMessage $R6 ${WM_SETTEXT} 0 "STR:Copiando archivos del juego... $R7 %"
FunctionEnd
!endif

!macro customUnInstall
  DetailPrint "Tus ajustes y partidas guardadas (carpeta de datos de MasterWar en tu perfil) NO se eliminan."
!macroend

; Instalación siempre por usuario (sin admin ni UAC): el launcher y el updater escriben en el perfil del usuario.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
