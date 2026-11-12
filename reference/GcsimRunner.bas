Attribute VB_Name = "GcsimRunner"
' =====================================================================
'  GcsimRunner - runs gcsim from the Genshin Damage Calculator workbook
'  RunSim       : writes the Config tab to a file, runs gcsim, imports results
'  AddRunButton : run once to add "Run Sim" buttons to Rotation and Results
' =====================================================================
Option Explicit

Private jText As String
Private jPos As Long
Private jLen As Long

' ---------------------------------------------------------------------
'  MAIN
' ---------------------------------------------------------------------
Public Sub RunSim()
    Dim folder As String, exeName As String, exePath As String
    Dim cfgPath As String, outPath As String, logPath As String
    Dim rs As Worksheet, q As String
    q = Chr(34)
    Set rs = ThisWorkbook.Worksheets("Results")

    folder = Trim(CStr(ThisWorkbook.Names("GCSIM_FOLDER").RefersToRange.Value))
    exeName = Trim(CStr(ThisWorkbook.Names("GCSIM_EXE").RefersToRange.Value))
    If Right(folder, 1) <> "\" Then folder = folder & "\"
    exePath = folder & exeName
    If Dir(exePath) = "" Then
        MsgBox "Can't find gcsim at:" & vbLf & exePath & vbLf & vbLf & _
               "Check the gcsim Folder and Program Name cells on the Rotation tab.", vbExclamation, "Run Sim"
        Exit Sub
    End If
    cfgPath = folder & "excel_config.txt"
    outPath = folder & "excel_result.json"
    logPath = folder & "excel_log.txt"

    Application.Calculate
    If Not WriteConfig(cfgPath) Then Exit Sub

    On Error Resume Next
    Kill outPath
    Kill logPath
    On Error GoTo 0

    rs.Range("B5").Value = Now
    rs.Range("B6").Value = "Running gcsim..."
    Application.StatusBar = "Running gcsim simulation..."
    DoEvents

    Dim sh As Object, cmd As String
    Set sh = CreateObject("WScript.Shell")
    cmd = "cmd /c " & q & q & exePath & q & " -c " & q & cfgPath & q & " -out " & q & outPath & q & _
          " -nb > " & q & logPath & q & " 2>&1" & q
    sh.Run cmd, 0, True
    Application.StatusBar = False

    If Dir(outPath) = "" Then
        Dim logTxt As String
        logTxt = ReadTextFile(logPath)
        If Len(logTxt) = 0 Then logTxt = "gcsim produced no result and no log. Check that the program runs on its own."
        rs.Range("B6").Value = "ERROR: " & Left(Replace(logTxt, vbCrLf, " "), 900)
        rs.Activate
        MsgBox "gcsim reported a problem:" & vbLf & vbLf & Left(logTxt, 900), vbExclamation, "Run Sim"
        Exit Sub
    End If

    Dim root As Object
    Set root = ParseJson(ReadTextFile(outPath))
    WriteResults root
    AppendHistory root
    rs.Activate
End Sub

' ---------------------------------------------------------------------
'  CONFIG FILE
' ---------------------------------------------------------------------
Private Function WriteConfig(path As String) As Boolean
    Dim rng As Range, c As Range, f As Integer, v As String, n As Long
    Set rng = ThisWorkbook.Names("GCSIM_CONFIG").RefersToRange
    f = FreeFile
    On Error GoTo fail
    Open path For Output As #f
    For Each c In rng.Cells
        If IsError(c.Value) Then
            Close #f
            MsgBox "The Config tab has an error in cell " & c.Address(False, False) & _
                   ". Check the Team and Rotation tabs.", vbExclamation, "Run Sim"
            Exit Function
        End If
        v = CStr(c.Value)
        If Len(Trim(v)) > 0 Then Print #f, v: n = n + 1
    Next c
    Close #f
    WriteConfig = (n > 0)
    Exit Function
fail:
    MsgBox "Could not write the config file:" & vbLf & path & vbLf & Err.Description, vbExclamation, "Run Sim"
End Function

Private Function ReadTextFile(path As String) As String
    If Dir(path) = "" Then Exit Function
    Dim st As Object
    Set st = CreateObject("ADODB.Stream")
    st.Type = 2
    st.Charset = "utf-8"
    st.Open
    st.LoadFromFile path
    ReadTextFile = st.ReadText
    st.Close
End Function

' ---------------------------------------------------------------------
'  RESULTS
' ---------------------------------------------------------------------
Private Sub WriteResults(root As Object)
    Dim rs As Worksheet, st As Object, chars As Object
    Dim i As Long, nC As Long, r As Long, teamDps As Double
    Set rs = ThisWorkbook.Worksheets("Results")
    Set st = root("statistics")
    Set chars = root("character_details")
    nC = chars.Count

    rs.Range("D5:H12").ClearContents
    rs.Range("J5:L60").ClearContents
    rs.Range("A17:D400").ClearContents
    rs.Range("F17:H400").ClearContents

    teamDps = Num(st("dps"), "mean")
    rs.Range("B6").Value = "OK"
    rs.Range("B7").Value = teamDps
    rs.Range("B8").Value = Num(st("dps"), "min")
    rs.Range("B9").Value = Num(st("dps"), "max")
    rs.Range("B10").Value = Num(st("dps"), "sd")
    rs.Range("B11").Value = Num(st("duration"), "mean")
    rs.Range("B12").Value = st("iterations")
    rs.Range("B13").Value = Num(st("total_damage"), "mean")
    rs.Range("B7:B10,B13").NumberFormat = "#,##0"
    rs.Range("B11").NumberFormat = "0.0"

    ' characters
    For i = 1 To nC
        r = 4 + i
        rs.Cells(r, 4).Value = DisplayName(CStr(chars(i)("name")))
        rs.Cells(r, 5).Value = Num(st("character_dps")(i), "mean")
        If teamDps > 0 Then rs.Cells(r, 6).Value = rs.Cells(r, 5).Value / teamDps
        On Error Resume Next
        rs.Cells(r, 7).Value = Num(st("field_time")(i), "mean")
        rs.Cells(r, 8).Value = Num(st("end_stats")(i)("ending_energy"), "mean")
        On Error GoTo 0
    Next i
    rs.Range("E5:E12").NumberFormat = "#,##0"
    rs.Range("F5:F12").NumberFormat = "0.0%"
    rs.Range("G5:H12").NumberFormat = "0.0"

    ' problems (time lost) and warnings
    Dim k As Variant, fa As Object, secs As Double
    r = 5
    On Error Resume Next
    For i = 1 To nC
        Set fa = Nothing
        Set fa = st("failed_actions")(i)
        If Not fa Is Nothing Then
            For Each k In fa.Keys
                secs = Num(fa(k), "mean")
                If secs > 0.005 Then
                    rs.Cells(r, 10).Value = Replace(CStr(k), "_", " ")
                    rs.Cells(r, 11).Value = DisplayName(CStr(chars(i)("name")))
                    rs.Cells(r, 12).Value = secs
                    rs.Cells(r, 12).NumberFormat = "0.00"
                    r = r + 1
                End If
            Next k
        End If
    Next i
    Dim w As Object
    Set w = Nothing
    Set w = st("warnings")
    If Not w Is Nothing Then
        For Each k In w.Keys
            If w(k) = True Then
                rs.Cells(r, 10).Value = "warning: " & Replace(CStr(k), "_", " ")
                r = r + 1
            End If
        Next k
    End If
    On Error GoTo 0
    If r = 5 Then rs.Cells(5, 10).Value = "None - rotation ran without waiting"

    ' damage by source, sorted high to low
    Dim names() As String, srcs() As String, vals() As Double, cnt As Long, src As Object
    ReDim names(1 To 500): ReDim srcs(1 To 500): ReDim vals(1 To 500)
    On Error Resume Next
    For i = 1 To nC
        Set src = Nothing
        Set src = st("source_dps")(i)("sources")
        If Not src Is Nothing Then
            For Each k In src.Keys
                If cnt < 500 Then
                    cnt = cnt + 1
                    names(cnt) = DisplayName(CStr(chars(i)("name")))
                    srcs(cnt) = CStr(k)
                    vals(cnt) = Num(src(k), "mean")
                End If
            Next k
        End If
    Next i
    On Error GoTo 0
    SortDesc names, srcs, vals, cnt
    For i = 1 To cnt
        rs.Cells(16 + i, 1).Value = names(i)
        rs.Cells(16 + i, 2).Value = srcs(i)
        rs.Cells(16 + i, 3).Value = vals(i)
        If teamDps > 0 Then rs.Cells(16 + i, 4).Value = vals(i) / teamDps
    Next i
    rs.Range("C17:C400").NumberFormat = "#,##0"
    rs.Range("D17:D400").NumberFormat = "0.0%"

    ' reactions
    Dim rx As Object
    r = 17
    On Error Resume Next
    For i = 1 To nC
        Set rx = Nothing
        Set rx = st("source_reactions")(i)("sources")
        If Not rx Is Nothing Then
            For Each k In rx.Keys
                rs.Cells(r, 6).Value = DisplayName(CStr(chars(i)("name")))
                rs.Cells(r, 7).Value = CStr(k)
                rs.Cells(r, 8).Value = Num(rx(k), "mean")
                rs.Cells(r, 8).NumberFormat = "0.0"
                r = r + 1
            Next k
        End If
    Next i
    On Error GoTo 0
End Sub

Private Sub AppendHistory(root As Object)
    Dim hs As Worksheet, tm As Worksheet, ro As Worksheet, st As Object
    Dim r As Long, i As Long, teamTxt As String, rotTxt As String
    Set hs = ThisWorkbook.Worksheets("History")
    Set tm = ThisWorkbook.Worksheets("Team")
    Set ro = ThisWorkbook.Worksheets("Rotation")
    Set st = root("statistics")
    r = hs.Cells(hs.Rows.Count, 1).End(xlUp).Row + 1
    If r < 4 Then r = 4
    For i = 3 To 6
        If Len(CStr(tm.Cells(4, i).Value)) > 0 Then teamTxt = teamTxt & IIf(Len(teamTxt) > 0, " / ", "") & tm.Cells(4, i).Value
    Next i
    For i = 15 To 54
        If Len(CStr(ro.Cells(i, 2).Value)) > 0 Then
            rotTxt = rotTxt & IIf(Len(rotTxt) > 0, " > ", "") & ro.Cells(i, 2).Value & " " & _
                     IIf(Len(CStr(ro.Cells(i, 4).Value)) > 0, ro.Cells(i, 4).Value, ro.Cells(i, 3).Value)
        End If
    Next i
    hs.Cells(r, 1).Value = Now
    hs.Cells(r, 1).NumberFormat = "yyyy-mm-dd hh:mm"
    hs.Cells(r, 2).Value = teamTxt
    hs.Cells(r, 3).Value = rotTxt
    hs.Cells(r, 4).Value = st("iterations")
    hs.Cells(r, 5).Value = Num(st("duration"), "mean")
    hs.Cells(r, 6).Value = Num(st("dps"), "mean")
    hs.Cells(r, 7).Value = Num(st("dps"), "sd")
    For i = 1 To root("character_details").Count
        If i <= 4 Then hs.Cells(r, 7 + i).Value = Num(st("character_dps")(i), "mean")
    Next i
    hs.Range(hs.Cells(r, 5), hs.Cells(r, 11)).NumberFormat = "#,##0"
    hs.Cells(r, 5).NumberFormat = "0.0"
End Sub

Private Function Num(obj As Variant, key As String) As Double
    On Error Resume Next
    Num = CDbl(obj(key))
End Function

Private Function DisplayName(gkey As String) As String
    ' turn gcsim keys back into names using the Team tab, then GC_Keys
    Dim gk As Worksheet, r As Long
    Set gk = ThisWorkbook.Worksheets("GC_Keys")
    For r = 4 To 400
        If Len(CStr(gk.Cells(r, 1).Value)) = 0 Then Exit For
        If LCase(CStr(gk.Cells(r, 2).Value)) = LCase(gkey) Then DisplayName = gk.Cells(r, 1).Value: Exit Function
    Next r
    DisplayName = gkey
End Function

Private Sub SortDesc(a() As String, b() As String, v() As Double, n As Long)
    Dim i As Long, j As Long, ta As String, tb As String, tv As Double
    For i = 2 To n
        ta = a(i): tb = b(i): tv = v(i)
        j = i - 1
        Do While j >= 1
            If v(j) >= tv Then Exit Do
            a(j + 1) = a(j): b(j + 1) = b(j): v(j + 1) = v(j)
            j = j - 1
        Loop
        a(j + 1) = ta: b(j + 1) = tb: v(j + 1) = tv
    Next i
End Sub

' ---------------------------------------------------------------------
'  BUTTONS (run once)
' ---------------------------------------------------------------------
Public Sub AddRunButton()
    AddButtonTo ThisWorkbook.Worksheets("Rotation"), "E4"
    AddButtonTo ThisWorkbook.Worksheets("Results"), "D1"
    MsgBox "Run Sim buttons added to the Rotation and Results tabs.", vbInformation, "Run Sim"
End Sub

Private Sub AddButtonTo(ws As Worksheet, anchor As String)
    Dim shp As Shape, b As Object
    For Each shp In ws.Shapes
        If shp.Name = "btnRunSim" Then shp.Delete
    Next shp
    With ws.Range(anchor)
        Set b = ws.Buttons.Add(.Left, .Top, 120, 30)
    End With
    b.Name = "btnRunSim"
    b.Caption = "Run Sim"
    b.OnAction = "RunSim"
End Sub

' ---------------------------------------------------------------------
'  MINIMAL JSON PARSER (objects -> Dictionary, arrays -> Collection)
' ---------------------------------------------------------------------
Private Function ParseJson(ByVal s As String) As Object
    jText = s: jPos = 1: jLen = Len(s)
    Dim v As Variant
    ParseValue v
    If IsObject(v) Then Set ParseJson = v
End Function

Private Sub ParseValue(ByRef v As Variant)
    SkipWs
    Select Case Mid$(jText, jPos, 1)
        Case "{": Set v = ParseObject()
        Case "[": Set v = ParseArray()
        Case """": v = ParseString()
        Case "t": jPos = jPos + 4: v = True
        Case "f": jPos = jPos + 5: v = False
        Case "n": jPos = jPos + 4: v = Null
        Case Else: v = ParseNumber()
    End Select
End Sub

Private Function ParseObject() As Object
    Dim d As Object, k As String, ch As String
    Set d = CreateObject("Scripting.Dictionary")
    jPos = jPos + 1
    SkipWs
    If Mid$(jText, jPos, 1) = "}" Then jPos = jPos + 1: Set ParseObject = d: Exit Function
    Do
        SkipWs
        k = ParseString()
        SkipWs
        jPos = jPos + 1              ' colon
        If d.Exists(k) Then d.Remove k
        AddToDict d, k
        SkipWs
        ch = Mid$(jText, jPos, 1)
        jPos = jPos + 1
        If ch <> "," Then Exit Do
    Loop
    Set ParseObject = d
End Function

Private Function ParseArray() As Object
    Dim c As Collection, ch As String
    Set c = New Collection
    jPos = jPos + 1
    SkipWs
    If Mid$(jText, jPos, 1) = "]" Then jPos = jPos + 1: Set ParseArray = c: Exit Function
    Do
        AddToColl c
        SkipWs
        ch = Mid$(jText, jPos, 1)
        jPos = jPos + 1
        If ch <> "," Then Exit Do
    Loop
    Set ParseArray = c
End Function

Private Sub AddToDict(d As Object, k As String)
    Dim v As Variant
    ParseValue v
    d.Add k, v
End Sub

Private Sub AddToColl(c As Collection)
    Dim v As Variant
    ParseValue v
    c.Add v
End Sub

Private Function ParseString() As String
    Dim sb As String, qp As Long, bp As Long, ch As String
    jPos = jPos + 1
    Do
        qp = InStr(jPos, jText, """")
        bp = InStr(jPos, jText, "\")
        If qp = 0 Then sb = sb & Mid$(jText, jPos): jPos = jLen + 1: Exit Do
        If bp = 0 Or qp < bp Then
            sb = sb & Mid$(jText, jPos, qp - jPos)
            jPos = qp + 1
            Exit Do
        End If
        sb = sb & Mid$(jText, jPos, bp - jPos)
        ch = Mid$(jText, bp + 1, 1)
        Select Case ch
            Case "n": sb = sb & vbLf: jPos = bp + 2
            Case "r": sb = sb & vbCr: jPos = bp + 2
            Case "t": sb = sb & vbTab: jPos = bp + 2
            Case "b", "f": jPos = bp + 2
            Case "u": sb = sb & ChrW(CLng("&H" & Mid$(jText, bp + 2, 4))): jPos = bp + 6
            Case Else: sb = sb & ch: jPos = bp + 2
        End Select
    Loop
    ParseString = sb
End Function

Private Function ParseNumber() As Double
    Dim st As Long, ch As String
    st = jPos
    Do While jPos <= jLen
        ch = Mid$(jText, jPos, 1)
        If InStr("+-0123456789.eE", ch) = 0 Then Exit Do
        jPos = jPos + 1
    Loop
    ParseNumber = Val(Mid$(jText, st, jPos - st))
End Function

Private Sub SkipWs()
    Dim ch As String
    Do While jPos <= jLen
        ch = Mid$(jText, jPos, 1)
        If ch <> " " And ch <> vbTab And ch <> vbCr And ch <> vbLf Then Exit Do
        jPos = jPos + 1
    Loop
End Sub
