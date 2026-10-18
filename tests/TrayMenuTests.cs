using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using Memoir;

internal static class TrayMenuTests {
    static int checks;
    static void Check(bool value, string message) { if (!value) throw new Exception(message); ++checks; }
    static IEnumerable<DependencyObject> Tree(DependencyObject root) { yield return root; for (int i=0;i<VisualTreeHelper.GetChildrenCount(root);i++) foreach(var child in Tree(VisualTreeHelper.GetChild(root,i))) yield return child; }
    static void Pump(int milliseconds) { var frame=new DispatcherFrame();var timer=new DispatcherTimer {Interval=TimeSpan.FromMilliseconds(milliseconds)};timer.Tick+=delegate{timer.Stop();frame.Continue=false;};timer.Start();Dispatcher.PushFrame(frame); }
    [STAThread] static int Main(string[] args) {
        try {
            var app=new Application {ShutdownMode=ShutdownMode.OnExplicitShutdown};
            foreach(string action in new[]{"report","today","pause","quit"}) {
                foreach(string theme in new[]{"light","dark","pink"}) {
                    string chosen=null;bool deliveredBeforeClose=false;
                    var appearance=Appearance.Resolve(Json.Object("mode",theme,"theme",theme));
                    var menu=new TrayMenu(args[0],appearance,action=="pause",new System.Drawing.Point(600,600),value=>chosen=value);
                    menu.Closed+=delegate{deliveredBeforeClose=chosen==action;};menu.Show();Pump(450);
                    Check(menu.IsVisible,"Menu remains open after its entrance");
                    Button target=null;foreach(var node in Tree(menu)) {var button=node as Button;if(button!=null && (string)button.Tag==action)target=button;}
                    Check(target!=null,"All actions are discoverable");
                    Check(target.ActualWidth>180 && target.ActualHeight>=34,"Actions have a usable pointer target");
                    target.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Pump(220);
                    Check(chosen==action,"Selection reaches the callback: "+action);
                    Check(deliveredBeforeClose,"Selection is delivered before the popup shuts down");
                    Check(!menu.IsVisible,"Popup closes after selecting an action");
                }
            }
            app.Shutdown();Console.WriteLine("PASS: "+checks+" native tray layout and action lifecycle checks.");return 0;
        }catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
